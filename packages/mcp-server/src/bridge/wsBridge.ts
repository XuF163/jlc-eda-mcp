import crypto from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';

const HelloMessageSchema = z.object({
	type: z.literal('hello'),
	token: z.string().optional(),
	app: z
		.object({
			name: z.string().optional(),
			version: z.string().optional(),
			edaVersion: z.string().optional(),
		})
		.optional(),
});

const ResponseMessageSchema = z.object({
	type: z.literal('response'),
	id: z.string(),
	result: z.unknown().optional(),
	error: z
		.object({
			code: z.string(),
			message: z.string(),
			data: z.unknown().optional(),
		})
		.optional(),
});

const RequestMessageSchema = z.object({
	type: z.literal('request'),
	id: z.string(),
	method: z.string(),
	params: z.unknown().optional(),
});

type HelloMessage = z.infer<typeof HelloMessageSchema>;
type ResponseMessage = z.infer<typeof ResponseMessageSchema>;
type RequestMessage = z.infer<typeof RequestMessageSchema>;

type PendingCall = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timeout: NodeJS.Timeout;
};

export type BridgeStatus = {
	listenPort: number;
	tokenRequired: boolean;
	connected: boolean;
	client?: {
		app?: HelloMessage['app'];
		connectedAt: string;
		remoteAddress?: string;
	};
};

export class WsBridge {
	readonly token: string | undefined;
	readonly listenPort: number;

	#server: WebSocketServer;
	#socket: WebSocket | undefined;
	#clientHello: HelloMessage | undefined;
	#connectedAt: Date | undefined;
	#remoteAddress: string | undefined;
	#pending = new Map<string, PendingCall>();
	#log: ((line: string) => void) | undefined;

	constructor(opts: { port: number; token?: string; log?: (line: string) => void }) {
		this.listenPort = opts.port;
		this.token = opts.token;
		this.#log = opts.log;

		this.#server = new WebSocketServer({ host: '127.0.0.1', port: opts.port });
		this.#server.on('connection', (ws, req) => this.#handleConnection(ws, req.socket.remoteAddress));
	}

	getStatus(): BridgeStatus {
		return {
			listenPort: this.listenPort,
			tokenRequired: Boolean(this.token),
			connected: Boolean(this.#socket),
			client: this.#socket
				? {
						app: this.#clientHello?.app,
						connectedAt: (this.#connectedAt ?? new Date()).toISOString(),
						remoteAddress: this.#remoteAddress,
					}
				: undefined,
		};
	}

	async call(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
		const ws = this.#socket;
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			throw new Error('EDA bridge is not connected');
		}

		const id = crypto.randomUUID();
		const msg: RequestMessage = { type: 'request', id, method, params };

		return await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.#pending.delete(id);
				reject(new Error(`Bridge call timeout: ${method}`));
			}, timeoutMs);

			this.#pending.set(id, { resolve, reject, timeout });

			ws.send(JSON.stringify(msg), (err) => {
				if (!err) return;
				clearTimeout(timeout);
				this.#pending.delete(id);
				reject(err);
			});
		});
	}

	close(): void {
		try {
			this.#socket?.close();
		} catch {
			// ignore
		}
		this.#server.close();
	}

	#handleConnection(ws: WebSocket, remoteAddress?: string | null): void {
		const tokenRequired = Boolean(this.token);
		let handshaked = false;

		this.#log?.(`[jlceda-eda-mcp] WS connection from ${remoteAddress ?? 'unknown'} (awaiting hello)`);

		const handshakeTimeout = setTimeout(() => {
			if (!handshaked) {
				this.#log?.(`[jlceda-eda-mcp] WS handshake timeout from ${remoteAddress ?? 'unknown'}`);
				ws.close(4001, 'Handshake timeout');
			}
		}, 5_000);

		ws.on('message', (data) => {
			const text = typeof data === 'string' ? data : data.toString('utf8');
			let json: unknown;
			try {
				json = JSON.parse(text);
			} catch {
				return;
			}

			if (!handshaked) {
				const parsed = HelloMessageSchema.safeParse(json);
				if (!parsed.success) {
					ws.close(4002, 'Invalid hello');
					return;
				}
				const hello = parsed.data;
				if (tokenRequired && hello.token !== this.token) {
					ws.close(4003, 'Invalid token');
					return;
				}

				clearTimeout(handshakeTimeout);
				handshaked = true;

				// Replace existing connection (POC: single client)
				try {
					this.#socket?.close(4000, 'Replaced by new connection');
				} catch {
					// ignore
				}

				this.#socket = ws;
				this.#clientHello = hello;
				this.#connectedAt = new Date();
				this.#remoteAddress = remoteAddress ?? undefined;

				this.#log?.(
					`[jlceda-eda-mcp] EDA connected from ${this.#remoteAddress ?? 'unknown'} app=${JSON.stringify(
						hello.app ?? {},
					)}`,
				);

				return;
			}

			const parsed = ResponseMessageSchema.safeParse(json);
			if (!parsed.success) return;
			this.#handleResponse(parsed.data);
		});

		ws.on('close', (code, reason) => {
			clearTimeout(handshakeTimeout);
			const reasonText = reason ? reason.toString() : '';
			const tag = handshaked ? 'EDA' : 'WS (no-hello)';
			this.#log?.(`[jlceda-eda-mcp] ${tag} disconnected code=${code}${reasonText ? ` reason=${reasonText}` : ''}`);
			if (this.#socket === ws) {
				this.#socket = undefined;
				this.#clientHello = undefined;
				this.#connectedAt = undefined;
				this.#remoteAddress = undefined;
			}

			for (const [id, pending] of this.#pending) {
				clearTimeout(pending.timeout);
				pending.reject(new Error('Bridge disconnected'));
				this.#pending.delete(id);
			}
		});

		ws.on('error', () => {
			// ignore; close handler will clean up
		});

		if (remoteAddress && remoteAddress !== '127.0.0.1' && remoteAddress !== '::1') {
			// POC: we still allow it, but this is a hint for the user
			void remoteAddress;
		}
	}

	#handleResponse(msg: ResponseMessage): void {
		const pending = this.#pending.get(msg.id);
		if (!pending) return;
		clearTimeout(pending.timeout);
		this.#pending.delete(msg.id);

		if (msg.error) {
			const err = new Error(msg.error.message);
			// @ts-expect-error attach metadata
			err.code = msg.error.code;
			// @ts-expect-error attach metadata
			err.data = msg.error.data;
			pending.reject(err);
			return;
		}

		pending.resolve(msg.result);
	}
}

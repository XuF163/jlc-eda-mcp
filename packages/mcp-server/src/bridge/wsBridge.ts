import crypto from 'node:crypto';
import * as http from 'node:http';
import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';

const DOCS_PREFIX = '/docs';

function resolveDocsRoot(): string | undefined {
	if ((process.env.JLCEDA_DOCS_DISABLED ?? '') === '1') return undefined;

	const env = process.env.JLCEDA_DOCS_ROOT?.trim();
	if (env) return env;

	// Repo default (when running from repo root)
	const cwdCandidate = path.resolve(process.cwd(), 'packages', 'eda-extension', 'docs');
	if (fs.existsSync(cwdCandidate)) return cwdCandidate;

	// Fallback: relative to this file (useful when running from built dist/)
	const metaCandidate = fileURLToPath(new URL('../../../../eda-extension/docs', import.meta.url));
	if (fs.existsSync(metaCandidate)) return metaCandidate;

	return undefined;
}

function safeDecodePathSegment(seg: string): string | undefined {
	try {
		return decodeURIComponent(seg);
	} catch {
		return undefined;
	}
}

function contentTypeForFile(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case '.md':
			return 'text/markdown; charset=utf-8';
		case '.txt':
			return 'text/plain; charset=utf-8';
		case '.json':
			return 'application/json; charset=utf-8';
		case '.svg':
			return 'image/svg+xml; charset=utf-8';
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.gif':
			return 'image/gif';
		default:
			return 'application/octet-stream';
	}
}

async function statMaybe(p: string): Promise<import('node:fs').Stats | undefined> {
	try {
		return await fsp.stat(p);
	} catch (err) {
		if ((err as any)?.code === 'ENOENT') return undefined;
		throw err;
	}
}

const HelloMessageSchema = z.object({
	type: z.literal('hello'),
	// Token is intentionally ignored (local-only bridge). Kept optional for backward compatibility with older extensions.
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
	readonly listenPort: number;

	#httpServer: http.Server;
	#server: WebSocketServer;
	#docsRoot: string | undefined;
	#socket: WebSocket | undefined;
	#clientHello: HelloMessage | undefined;
	#connectedAt: Date | undefined;
	#remoteAddress: string | undefined;
	#pending = new Map<string, PendingCall>();
	#log: ((line: string) => void) | undefined;
	#keepAliveTimer: NodeJS.Timeout | undefined;
	#keepAliveInFlight = false;

	constructor(opts: { port: number; log?: (line: string) => void }) {
		this.listenPort = opts.port;
		this.#log = opts.log;

		this.#docsRoot = resolveDocsRoot();

		this.#httpServer = http.createServer((req, res) => {
			void this.#handleHttpRequest(req, res);
		});
		this.#httpServer.listen({ host: '127.0.0.1', port: opts.port });

		this.#server = new WebSocketServer({ server: this.#httpServer });
		this.#server.on('connection', (ws, req) => this.#handleConnection(ws, req.socket.remoteAddress));

		if (this.#docsRoot) {
			this.#log?.(`[jlceda-eda-mcp] Docs available at http://127.0.0.1:${opts.port}${DOCS_PREFIX}/`);
		}
	}

	getStatus(): BridgeStatus {
		return {
			listenPort: this.listenPort,
			tokenRequired: false,
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
		this.#stopKeepAlive();
		try {
			this.#socket?.close();
		} catch {
			// ignore
		}
		try {
			this.#server.close();
		} catch {
			// ignore
		}
		try {
			this.#httpServer.close();
		} catch {
			// ignore
		}
	}

	async #handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			if (await this.#tryServeDocs(req, res)) return;

			// Everything else is WS-only.
			res.statusCode = 426;
			res.setHeader('content-type', 'text/plain; charset=utf-8');
			res.setHeader('cache-control', 'no-store');
			res.end('Upgrade Required (WebSocket)');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.#log?.(`[jlceda-eda-mcp] HTTP(${this.listenPort}) error: ${msg}`);
			res.statusCode = 500;
			res.setHeader('content-type', 'text/plain; charset=utf-8');
			res.setHeader('cache-control', 'no-store');
			res.end('Internal Server Error');
		}
	}

	async #tryServeDocs(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
		if (!this.#docsRoot) return false;

		const method = (req.method ?? 'GET').toUpperCase();
		if (method !== 'GET' && method !== 'HEAD') return false;

		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
		const pathname = url.pathname || '/';
		if (!pathname.startsWith(DOCS_PREFIX)) return false;

		let rel = pathname.slice(DOCS_PREFIX.length); // "" or "/..."
		if (rel.startsWith('/')) rel = rel.slice(1);

		// Normalize and guard against directory traversal.
		const rawSegments = rel.split('/').filter(Boolean);
		const segments: Array<string> = [];
		for (const raw of rawSegments) {
			const decoded = safeDecodePathSegment(raw);
			if (!decoded) {
				res.statusCode = 400;
				res.setHeader('content-type', 'text/plain; charset=utf-8');
				res.end('Bad Request');
				return true;
			}
			if (!decoded || decoded === '.' || decoded === '..') {
				res.statusCode = 400;
				res.setHeader('content-type', 'text/plain; charset=utf-8');
				res.end('Bad Request');
				return true;
			}
			if (decoded.includes('\0') || decoded.includes('/') || decoded.includes('\\')) {
				res.statusCode = 400;
				res.setHeader('content-type', 'text/plain; charset=utf-8');
				res.end('Bad Request');
				return true;
			}
			segments.push(decoded);
		}

		const fsPath = path.join(this.#docsRoot, ...segments);
		const st = await statMaybe(fsPath);
		if (!st) {
			res.statusCode = 404;
			res.setHeader('content-type', 'text/plain; charset=utf-8');
			res.end('Not Found');
			return true;
		}

		if (st.isDirectory()) {
			const indexCandidates = ['README.md', 'index.md'];
			for (const name of indexCandidates) {
				const p = path.join(fsPath, name);
				const s = await statMaybe(p);
				if (s?.isFile()) {
					await this.#sendFile(res, p, method === 'HEAD');
					return true;
				}
			}

			const entries = await fsp.readdir(fsPath, { withFileTypes: true });
			const lines = entries
				.slice()
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`);

			res.statusCode = 200;
			res.setHeader('content-type', 'text/plain; charset=utf-8');
			res.setHeader('cache-control', 'no-store');
			res.setHeader('x-content-type-options', 'nosniff');
			if (method === 'HEAD') {
				res.end();
				return true;
			}

			const prefix = pathname.endsWith('/') ? pathname : `${pathname}/`;
			res.end(['Index:', prefix, '', ...lines, ''].join('\n'));
			return true;
		}

		if (st.isFile()) {
			await this.#sendFile(res, fsPath, method === 'HEAD');
			return true;
		}

		res.statusCode = 404;
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		res.end('Not Found');
		return true;
	}

	async #sendFile(res: http.ServerResponse, filePath: string, headOnly: boolean): Promise<void> {
		const data = await fsp.readFile(filePath);
		res.statusCode = 200;
		res.setHeader('content-type', contentTypeForFile(filePath));
		res.setHeader('cache-control', 'no-store');
		res.setHeader('x-content-type-options', 'nosniff');
		if (headOnly) {
			res.end();
			return;
		}
		res.end(data);
	}

	#startKeepAlive(): void {
		this.#stopKeepAlive();

		// Kick off an immediate ping so the extension can confirm handshake.
		void this.call('ping', undefined, 5_000).catch(() => {
			// ignore
		});

		this.#keepAliveTimer = setInterval(() => {
			if (!this.#socket) return;
			if (this.#keepAliveInFlight) return;
			this.#keepAliveInFlight = true;

			void this.call('ping', undefined, 5_000)
				.catch(() => {
					// ignore; disconnect/timeout will be handled by ws close or next MCP call
				})
				.finally(() => {
					this.#keepAliveInFlight = false;
				});
		}, 15_000);
	}

	#stopKeepAlive(): void {
		if (this.#keepAliveTimer) clearInterval(this.#keepAliveTimer);
		this.#keepAliveTimer = undefined;
		this.#keepAliveInFlight = false;
	}

	#handleConnection(ws: WebSocket, remoteAddress?: string | null): void {
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

				clearTimeout(handshakeTimeout);
				handshaked = true;

				// Replace existing connection (POC: single client)
				this.#stopKeepAlive();
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

				this.#startKeepAlive();
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
				this.#stopKeepAlive();
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

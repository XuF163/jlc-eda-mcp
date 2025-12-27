import * as extensionConfig from '../../extension.json';
import { loadBridgeConfig } from './config';

type DebugLogEntry = {
	ts: number;
	level: 'debug' | 'info' | 'warn' | 'error';
	message: string;
	data?: unknown;
};

type RuntimeState = {
	updatedAt: number;
	connectionState: BridgeStatusSnapshot['connectionState'];
	transport: BridgeStatusSnapshot['transport'];
	lastConnectedAt?: number;
	lastError?: string;
	debugLog?: Array<DebugLogEntry>;
};

const RUNTIME_KEY = 'jlceda_mcp_bridge_runtime_v1';

function loadRuntimeState(): RuntimeState | undefined {
	try {
		return (eda as any)?.sys_Storage?.getExtensionUserConfig?.(RUNTIME_KEY) as any;
	} catch {
		return undefined;
	}
}

function saveRuntimeState(state: RuntimeState): void {
	try {
		// fire-and-forget; status/diagnostics are best-effort
		void (eda as any)?.sys_Storage?.setExtensionUserConfig?.(RUNTIME_KEY, state);
	} catch {
		// ignore
	}
}

export type BridgeStatusSnapshot = {
	extension: { name: string; version: string };
	connected: boolean;
	connectionState: 'disconnected' | 'connecting' | 'connected';
	transport: 'sys_WebSocket' | 'globalWebSocket' | 'none';
	serverUrl: string;
	lastConnectedAt?: number;
	lastError?: string;
	stateSource: 'memory' | 'storage';
	runtimeUpdatedAt?: number;
};

type RpcHello = {
	type: 'hello';
	token?: string;
	app?: { name?: string; version?: string; edaVersion?: string };
};

type RpcRequest = {
	type: 'request';
	id: string;
	method: string;
	params?: unknown;
};

type RpcResponse =
	| { type: 'response'; id: string; result: unknown }
	| { type: 'response'; id: string; error: { code: string; message: string; data?: unknown } };

function toJson(msg: unknown): string {
	return JSON.stringify(msg);
}

function isRpcRequest(msg: any): msg is RpcRequest {
	return Boolean(msg && msg.type === 'request' && typeof msg.id === 'string' && typeof msg.method === 'string');
}

export class BridgeClient {
	#socket: WebSocket | undefined;
	#lastConnectedAt: number | undefined;
	#lastError: string | undefined;
	#connectTimer: any | undefined;
	#debugLog: Array<DebugLogEntry> = [];
	#connectionState: BridgeStatusSnapshot['connectionState'] = 'disconnected';
	#transport: BridgeStatusSnapshot['transport'] = 'none';
	#registeredUrl: string | undefined;
	#lastPersistAt = 0;

	static readonly SYS_WS_ID = 'jlceda_mcp_bridge_ws_v1';

	#pushLog(level: DebugLogEntry['level'], message: string, data?: unknown): void {
		this.#debugLog.push({ ts: Date.now(), level, message, data });
		if (this.#debugLog.length > 200) this.#debugLog.splice(0, this.#debugLog.length - 200);
		this.#persistRuntime(false);
	}

	getDebugLog(): Array<DebugLogEntry> {
		if (this.#debugLog.length) return [...this.#debugLog];
		const runtime = loadRuntimeState();
		if (runtime?.debugLog && Array.isArray(runtime.debugLog)) return runtime.debugLog;
		return [];
	}

	getStatusSnapshot(): BridgeStatusSnapshot {
		// Infer transport availability even if this instance has not connected yet.
		const inferredTransport: BridgeStatusSnapshot['transport'] = this.#hasSysWebSocket()
			? 'sys_WebSocket'
			: typeof (globalThis as any).WebSocket === 'function'
				? 'globalWebSocket'
				: 'none';

		// If this runtime instance looks "fresh", prefer last persisted state so Status/Diagnostics remain useful
		// even when EDA invokes menu handlers in separate sandboxes.
		const runtime = loadRuntimeState();
		const isFreshInstance =
			this.#debugLog.length === 0 &&
			this.#connectionState === 'disconnected' &&
			this.#lastConnectedAt === undefined &&
			this.#lastError === undefined;

		if (runtime && isFreshInstance) {
			const storedTransport = runtime.transport;
			const resolvedTransport =
				storedTransport && storedTransport !== 'none' ? storedTransport : inferredTransport;
			return {
				extension: { name: extensionConfig.name, version: extensionConfig.version },
				connected: runtime.connectionState === 'connected',
				connectionState: runtime.connectionState,
				transport: resolvedTransport,
				serverUrl: loadBridgeConfig().serverUrl,
				lastConnectedAt: runtime.lastConnectedAt,
				lastError: runtime.lastError,
				stateSource: 'storage',
				runtimeUpdatedAt: runtime.updatedAt,
			};
		}

		return {
			extension: { name: extensionConfig.name, version: extensionConfig.version },
			connected: this.#connectionState === 'connected',
			connectionState: this.#connectionState,
			transport: this.#transport === 'none' ? inferredTransport : this.#transport,
			serverUrl: loadBridgeConfig().serverUrl,
			lastConnectedAt: this.#lastConnectedAt,
			lastError: this.#lastError,
			stateSource: 'memory',
		};
	}

	get isConnected(): boolean {
		return this.#connectionState === 'connected';
	}

	#hasSysWebSocket(): boolean {
		return Boolean((eda as any)?.sys_WebSocket && typeof (eda as any).sys_WebSocket.register === 'function');
	}

	#setState(state: BridgeStatusSnapshot['connectionState']): void {
		this.#connectionState = state;
		this.#persistRuntime(true);
	}

	#persistRuntime(force: boolean): void {
		const now = Date.now();
		const minIntervalMs = 250;
		if (!force && now - this.#lastPersistAt < minIntervalMs) return;
		this.#lastPersistAt = now;

		saveRuntimeState({
			updatedAt: now,
			connectionState: this.#connectionState,
			transport: this.#transport,
			lastConnectedAt: this.#lastConnectedAt,
			lastError: this.#lastError,
			debugLog: this.#debugLog.map((e) => ({ ...e })),
		});
	}

	connect(opts: { onRequest: (method: string, params: unknown) => Promise<unknown>; onInfo?: (msg: string) => void }): void {
		const cfg = loadBridgeConfig();
		const connectTimeoutMs = 8_000;

		this.#pushLog('info', 'connect() called', { serverUrl: cfg.serverUrl, hasToken: Boolean(cfg.token) });

		const preferSys = this.#hasSysWebSocket();
		this.#transport = preferSys ? 'sys_WebSocket' : typeof (globalThis as any).WebSocket === 'function' ? 'globalWebSocket' : 'none';
		this.#persistRuntime(true);

		this.#lastError = undefined;
		if (this.#transport === 'none') {
			this.#lastError = 'No WebSocket API available in this EDA environment';
			this.#pushLog('error', this.#lastError);
			opts.onInfo?.(this.#lastError);
			return;
		}

		if (this.#connectionState === 'connected' || this.#connectionState === 'connecting') {
			this.#pushLog('warn', 'connect() ignored: already connected/connecting', { state: this.#connectionState });
			opts.onInfo?.(this.#connectionState === 'connected' ? 'MCP bridge already connected.' : 'MCP bridge is connecting...');
			return;
		}

		// Prefer SYS_WebSocket in JLCEDA Pro (native WebSocket may be unavailable in the sandbox).
		if (this.#transport === 'sys_WebSocket') {
			// If URL changed, ensure old connection is closed; SYS_WebSocket keeps ID state internally.
			if (this.#registeredUrl && this.#registeredUrl !== cfg.serverUrl) {
				try {
					(eda as any).sys_WebSocket.close(BridgeClient.SYS_WS_ID, 1000, 'Reconfigure');
				} catch {
					// ignore
				}
			}

			this.#registeredUrl = cfg.serverUrl;
			this.#setState('connecting');
			opts.onInfo?.(`Connecting to ${cfg.serverUrl}...`);
			this.#pushLog('info', 'sys_WebSocket.register', { id: BridgeClient.SYS_WS_ID, url: cfg.serverUrl });

			if (this.#connectTimer) clearTimeout(this.#connectTimer);
			this.#connectTimer = setTimeout(() => {
				if (this.#connectionState !== 'connecting') return;
				this.#lastError = `Connect timeout after ${connectTimeoutMs}ms (url ${cfg.serverUrl}). Is the MCP server running and reachable?`;
				this.#pushLog('error', 'connect timeout', { timeoutMs: connectTimeoutMs, url: cfg.serverUrl, transport: 'sys_WebSocket' });
				opts.onInfo?.(this.#lastError);
				this.#setState('disconnected');
				try {
					(eda as any).sys_WebSocket.close(BridgeClient.SYS_WS_ID, 4004, 'Connect timeout');
				} catch {
					// ignore
				}
			}, connectTimeoutMs);

			const onMessage = async (event: MessageEvent<any>) => {
				const data = (event as any)?.data;
				let msg: any;
				try {
					msg = JSON.parse(String(data));
				} catch {
					this.#pushLog('warn', 'sys_WebSocket message: JSON parse failed');
					return;
				}

				if (!isRpcRequest(msg)) return;

				try {
					const result = await opts.onRequest(msg.method, msg.params);
					const response: RpcResponse = { type: 'response', id: msg.id, result };
					(eda as any).sys_WebSocket.send(BridgeClient.SYS_WS_ID, toJson(response));
				} catch (err: any) {
					const code = typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR';
					const message = typeof err?.message === 'string' ? err.message : String(err);
					const data2 = err?.data;
					const response: RpcResponse = { type: 'response', id: msg.id, error: { code, message, data: data2 } };
					(eda as any).sys_WebSocket.send(BridgeClient.SYS_WS_ID, toJson(response));
				}
			};

			const onConnected = () => {
				if (this.#connectTimer) clearTimeout(this.#connectTimer);
				this.#connectTimer = undefined;
				this.#lastConnectedAt = Date.now();
				this.#setState('connected');
				this.#pushLog('info', 'sys_WebSocket connected', { url: cfg.serverUrl });

				let edaVersion: string | undefined;
				try {
					edaVersion = eda.sys_Environment.getEditorCurrentVersion();
				} catch {
					// ignore
				}

				const hello: RpcHello = {
					type: 'hello',
					token: cfg.token,
					app: { name: extensionConfig.name, version: extensionConfig.version, edaVersion },
				};
				try {
					(eda as any).sys_WebSocket.send(BridgeClient.SYS_WS_ID, toJson(hello));
					this.#pushLog('debug', 'hello sent', { hasToken: Boolean(cfg.token), app: hello.app, transport: 'sys_WebSocket' });
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					this.#lastError = `WebSocket send failed: ${msg}`;
					this.#pushLog('error', 'hello send failed', { error: msg });
				}

				opts.onInfo?.(`Connected to ${cfg.serverUrl}`);
			};

			try {
				(eda as any).sys_WebSocket.register(BridgeClient.SYS_WS_ID, cfg.serverUrl, onMessage, onConnected);
			} catch (err) {
				if (this.#connectTimer) clearTimeout(this.#connectTimer);
				this.#connectTimer = undefined;
				this.#setState('disconnected');

				const msg = err instanceof Error ? err.message : String(err);
				this.#lastError = `SYS_WebSocket.register failed: ${msg}`;
				this.#pushLog('error', 'SYS_WebSocket.register failed', { error: msg });
				opts.onInfo?.(`${this.#lastError}\n\n请在扩展管理器里为该扩展开启“外部交互”权限。`);
			}

			return;
		}

		// Fallback: global WebSocket (may work in browser environment).
		if (typeof (globalThis as any).WebSocket !== 'function') {
			this.#lastError = 'WebSocket is not available in this EDA environment';
			this.#pushLog('error', this.#lastError);
			opts.onInfo?.(this.#lastError);
			return;
		}

		this.#setState('connecting');
		opts.onInfo?.(`Connecting to ${cfg.serverUrl}...`);

		let ws: WebSocket;
		try {
			ws = new (globalThis as any).WebSocket(cfg.serverUrl);
		} catch (err) {
			this.#setState('disconnected');
			const msg = err instanceof Error ? err.message : String(err);
			this.#lastError = `WebSocket constructor failed (url ${cfg.serverUrl}): ${msg}`;
			this.#pushLog('error', 'WebSocket constructor failed', { error: msg });
			opts.onInfo?.(this.#lastError);
			return;
		}

		this.#socket = ws;
		this.#pushLog('debug', 'WebSocket created', { url: cfg.serverUrl, readyState: (ws as any).readyState });

		if (this.#connectTimer) clearTimeout(this.#connectTimer);
		this.#connectTimer = setTimeout(() => {
			const ws = this.#socket;
			if (!ws) return;
			if ((ws as any).readyState !== (globalThis as any).WebSocket.CONNECTING) return;

			this.#lastError = `Connect timeout after ${connectTimeoutMs}ms (url ${cfg.serverUrl}). Is the MCP server running and reachable?`;
			this.#pushLog('error', 'connect timeout', { timeoutMs: connectTimeoutMs, url: cfg.serverUrl, transport: 'globalWebSocket' });
			opts.onInfo?.(this.#lastError);
			try {
				ws.close(4004, 'Connect timeout');
			} catch {
				// ignore
			}
			this.#socket = undefined;
			this.#setState('disconnected');
		}, connectTimeoutMs);

		this.#socket.onopen = () => {
			if (this.#connectTimer) clearTimeout(this.#connectTimer);
			this.#connectTimer = undefined;
			this.#lastConnectedAt = Date.now();
			this.#setState('connected');
			this.#pushLog('info', 'WebSocket onopen', { url: cfg.serverUrl });
			let edaVersion: string | undefined;
			try {
				edaVersion = eda.sys_Environment.getEditorCurrentVersion();
			} catch {
				// ignore
			}
			const hello: RpcHello = {
				type: 'hello',
				token: cfg.token,
				app: { name: extensionConfig.name, version: extensionConfig.version, edaVersion },
			};
			(ws as any).send(toJson(hello));
			this.#pushLog('debug', 'hello sent', { hasToken: Boolean(cfg.token), app: hello.app });
			opts.onInfo?.(`Connected to ${cfg.serverUrl}`);
		};

		this.#socket.onmessage = async (event) => {
			let msg: any;
			try {
				msg = JSON.parse(String((event as any).data));
			} catch {
				this.#pushLog('warn', 'onmessage: JSON parse failed');
				return;
			}

			if (!isRpcRequest(msg)) return;

			const ws = this.#socket;
			if (!ws) return;

			try {
				const result = await opts.onRequest(msg.method, msg.params);
				const response: RpcResponse = { type: 'response', id: msg.id, result };
				(ws as any).send(toJson(response));
			} catch (err: any) {
				const code = typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR';
				const message = typeof err?.message === 'string' ? err.message : String(err);
				const data = err?.data;
				const response: RpcResponse = { type: 'response', id: msg.id, error: { code, message, data } };
				(ws as any).send(toJson(response));
			}
		};

		this.#socket.onerror = () => {
			if (this.#connectTimer) clearTimeout(this.#connectTimer);
			this.#connectTimer = undefined;
			this.#lastError = `WebSocket error (url ${cfg.serverUrl})`;
			this.#pushLog('error', 'WebSocket onerror', { url: cfg.serverUrl });
			opts.onInfo?.(this.#lastError);
		};

		this.#socket.onclose = (ev) => {
			if (this.#connectTimer) clearTimeout(this.#connectTimer);
			this.#connectTimer = undefined;
			const reason = (ev as any)?.reason ? String((ev as any).reason) : '';
			this.#lastError = `Disconnected (code ${(ev as any)?.code ?? 'unknown'}${reason ? `: ${reason}` : ''})`;
			this.#pushLog('warn', 'WebSocket onclose', { code: (ev as any)?.code, reason, url: cfg.serverUrl });
			opts.onInfo?.(this.#lastError);
			this.#socket = undefined;
			this.#setState('disconnected');
		};
	}

	disconnect(opts?: { onInfo?: (msg: string) => void }): void {
		const ws = this.#socket;
		if (this.#connectTimer) clearTimeout(this.#connectTimer);
		this.#connectTimer = undefined;
		this.#pushLog('info', 'disconnect() called', { hadSocket: Boolean(ws) });
		if (this.#transport === 'sys_WebSocket') {
			try {
				(eda as any).sys_WebSocket.close(BridgeClient.SYS_WS_ID, 1000, 'User disconnect');
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.#lastError = `SYS_WebSocket.close failed: ${msg}`;
				this.#pushLog('error', 'SYS_WebSocket.close failed', { error: msg });
			}
			this.#setState('disconnected');
			this.#lastError = undefined;
			opts?.onInfo?.('Disconnected.');
			return;
		}

		if (ws) {
			try {
				(ws as any).onopen = null;
				(ws as any).onmessage = null;
				(ws as any).onerror = null;
				(ws as any).onclose = null;
			} catch {
				// ignore
			}
		}

		try {
			ws?.close(1000, 'User disconnect');
		} catch {
			// ignore
		}

		this.#socket = undefined;
		this.#lastError = undefined;
		this.#setState('disconnected');
		opts?.onInfo?.('Disconnected.');
	}

	dispose(): void {
		this.disconnect();
	}
}

import * as extensionConfig from '../../extension.json';
import { loadBridgeConfig } from './config';
import { refreshBridgePortLease, resolveBridgeServerUrl, type PortLeaseInfo } from './portLease';

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
	serverUrl?: string;
	port?: number;
	project?: { uuid?: string; name?: string; friendlyName?: string };
	lastConnectedAt?: number;
	lastServerRequestAt?: number;
	lastError?: string;
	debugLog?: Array<DebugLogEntry>;
};

const RUNTIME_KEY = 'jlceda_mcp_bridge_runtime_v1';

// Auto-reconnect tuning:
// - MCP server keepalive is ~15s (see mcp-server WsBridge).
// - SYS_WebSocket has no reliable close callback, so we treat lack of server traffic as a disconnect signal.
const AUTO_BASE_BACKOFF_MS = 1500;
const AUTO_MAX_BACKOFF_MS = 10_000;
const AUTO_CONNECTED_POLL_MS = 5_000;
const AUTO_STALE_TRAFFIC_MS = 25_000;

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
	configuredServerUrl: string;
	port?: number;
	project?: { uuid?: string; name?: string; friendlyName?: string };
	lastConnectedAt?: number;
	lastServerRequestAt?: number;
	lastError?: string;
	stateSource: 'memory' | 'storage';
	runtimeUpdatedAt?: number;
};

type RpcHello = {
	type: 'hello';
	app?: { name?: string; version?: string; edaVersion?: string };
	project?: { uuid?: string; name?: string; friendlyName?: string };
	server?: { url?: string; port?: number };
};

type RpcRequest = {
	type: 'request';
	id: string;
	method: string;
	params?: unknown;
	// Optional: for short-lived callers (e.g. websocat oneshot).
	// If true, the extension will disconnect right after responding to this request.
	closeAfterResponse?: boolean;
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
	#lastServerRequestAt: number | undefined;
	#lastError: string | undefined;
	#connectTimer: any | undefined;
	#handshakeTimer: any | undefined;
	#handshakeOk = false;
	#debugLog: Array<DebugLogEntry> = [];
	#connectionState: BridgeStatusSnapshot['connectionState'] = 'disconnected';
	#transport: BridgeStatusSnapshot['transport'] = 'none';
	#registeredUrl: string | undefined;
	#lastPersistAt = 0;
	#configuredServerUrl: string | undefined;
	#serverUrlInUse: string | undefined;
	#leaseInUse: PortLeaseInfo | undefined;
	#connectInProgress = false;
	#requestChain: Promise<void> = Promise.resolve();

	#autoEnabled = false;
	#autoTimer: any | undefined;
	#autoBackoffMs = AUTO_BASE_BACKOFF_MS;
	#autoMaxBackoffMs = AUTO_MAX_BACKOFF_MS;
	#autoOpts:
		| { onRequest: (method: string, params: unknown) => Promise<unknown>; onInfo?: (msg: string) => void }
		| undefined;

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
			const configuredServerUrl = loadBridgeConfig().serverUrl;
			const runtimeUrl = typeof runtime.serverUrl === 'string' && runtime.serverUrl.trim() ? runtime.serverUrl : configuredServerUrl;
			return {
				extension: { name: extensionConfig.name, version: extensionConfig.version },
				connected: runtime.connectionState === 'connected',
				connectionState: runtime.connectionState,
				transport: resolvedTransport,
				serverUrl: runtimeUrl,
				configuredServerUrl,
				port: runtime.port,
				project: runtime.project,
				lastConnectedAt: runtime.lastConnectedAt,
				lastServerRequestAt: runtime.lastServerRequestAt,
				lastError: runtime.lastError,
				stateSource: 'storage',
				runtimeUpdatedAt: runtime.updatedAt,
			};
		}

		const configuredServerUrl = this.#configuredServerUrl ?? loadBridgeConfig().serverUrl;
		const serverUrl = this.#serverUrlInUse ?? configuredServerUrl;
		return {
			extension: { name: extensionConfig.name, version: extensionConfig.version },
			connected: this.#connectionState === 'connected',
			connectionState: this.#connectionState,
			transport: this.#transport === 'none' ? inferredTransport : this.#transport,
			serverUrl,
			configuredServerUrl,
			port: this.#leaseInUse?.port,
			project: this.#leaseInUse?.project,
			lastConnectedAt: this.#lastConnectedAt,
			lastServerRequestAt: this.#lastServerRequestAt,
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
			serverUrl: this.#serverUrlInUse ?? this.#configuredServerUrl ?? loadBridgeConfig().serverUrl,
			port: this.#leaseInUse?.port,
			project: this.#leaseInUse?.project,
			lastConnectedAt: this.#lastConnectedAt,
			lastServerRequestAt: this.#lastServerRequestAt,
			lastError: this.#lastError,
			debugLog: this.#debugLog.map((e) => ({ ...e })),
		});
	}

	startAutoConnect(opts: { onRequest: (method: string, params: unknown) => Promise<unknown>; onInfo?: (msg: string) => void }): void {
		this.#autoEnabled = true;
		this.#autoOpts = opts;
		this.#autoBackoffMs = AUTO_BASE_BACKOFF_MS;
		if (this.#autoTimer) clearTimeout(this.#autoTimer);
		this.#autoTimer = undefined;
		// Start immediately (avoid relying on timers for the very first attempt).
		this.#autoTick();
	}

	stopAutoConnect(): void {
		this.#autoEnabled = false;
		this.#autoOpts = undefined;
		if (this.#autoTimer) clearTimeout(this.#autoTimer);
		this.#autoTimer = undefined;
	}

	#scheduleAuto(ms: number): void {
		if (!this.#autoEnabled) return;
		if (this.#autoTimer) clearTimeout(this.#autoTimer);
		this.#autoTimer = setTimeout(() => this.#autoTick(), ms);
	}

	#autoTick(): void {
		if (!this.#autoEnabled) return;

		const lease = this.#leaseInUse;
		if (lease) {
			void refreshBridgePortLease(lease.port, lease.project.uuid);
		}

		// If connection is stale (no server traffic), drop and retry (SYS_WebSocket has no onclose callback).
		if (this.#connectionState === 'connected' && this.#lastServerRequestAt) {
			const age = Date.now() - this.#lastServerRequestAt;
			if (age > AUTO_STALE_TRAFFIC_MS) {
				this.#lastError = `No server traffic for ${Math.round(age / 1000)}s; reconnecting...`;
				this.#pushLog('warn', 'stale connection; reconnecting', { ageMs: age });
				this.#autoBackoffMs = AUTO_BASE_BACKOFF_MS;
				this.disconnect();
			}
		}

		if (this.#connectionState === 'connected') {
			this.#scheduleAuto(AUTO_CONNECTED_POLL_MS);
			return;
		}
		if (this.#connectionState === 'connecting') {
			this.#scheduleAuto(2_000);
			return;
		}

		const opts = this.#autoOpts;
		if (!opts) {
			this.#scheduleAuto(10_000);
			return;
		}

		// Silent-ish retry loop: only bubble up "Connected" and actionable errors.
		this.connect({
			onRequest: opts.onRequest,
			onInfo: (msg) => {
				if (!opts.onInfo) return;
				if (msg.startsWith('Connected to')) opts.onInfo(msg);
				if (msg.includes('register failed') || msg.includes('permission')) opts.onInfo(msg);
			},
		});

		this.#scheduleAuto(this.#autoBackoffMs);
		this.#autoBackoffMs = Math.min(Math.floor(this.#autoBackoffMs * 1.6), this.#autoMaxBackoffMs);
	}

	#clearHandshakeTimer(): void {
		if (this.#handshakeTimer) clearTimeout(this.#handshakeTimer);
		this.#handshakeTimer = undefined;
	}

	#startHandshakeWatchdog(serverUrl: string, opts?: { onInfo?: (msg: string) => void }): void {
		this.#clearHandshakeTimer();
		this.#handshakeTimer = setTimeout(() => {
			if (this.#handshakeOk) return;
			this.#lastError = `Handshake not confirmed (no server request received). Check server status/logs. (${serverUrl})`;
			this.#pushLog('error', 'handshake timeout', { url: serverUrl });
			opts?.onInfo?.(this.#lastError);
			this.disconnect({ preserveLastError: true });
		}, 8_000);
	}

	#markServerTraffic(): void {
		this.#lastServerRequestAt = Date.now();
		this.#persistRuntime(false);
	}

	#enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
		const run = async () => await fn();
		const next = this.#requestChain.then(run, run);
		this.#requestChain = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	connect(opts: { onRequest: (method: string, params: unknown) => Promise<unknown>; onInfo?: (msg: string) => void }): void {
		if (this.#connectInProgress) return;
		if (this.#connectionState === 'connected' || this.#connectionState === 'connecting') {
			this.#pushLog('warn', 'connect() ignored: already connected/connecting', { state: this.#connectionState });
			opts.onInfo?.(this.#connectionState === 'connected' ? 'MCP bridge already connected.' : 'MCP bridge is connecting...');
			return;
		}

		this.#connectInProgress = true;
		void this.#connectAsync(opts).finally(() => {
			this.#connectInProgress = false;
		});
	}

	async #connectAsync(opts: { onRequest: (method: string, params: unknown) => Promise<unknown>; onInfo?: (msg: string) => void }): Promise<void> {
		const cfg = loadBridgeConfig();
		this.#configuredServerUrl = cfg.serverUrl;

		let serverUrl = cfg.serverUrl;
		try {
			const resolved = await resolveBridgeServerUrl(cfg.serverUrl);
			serverUrl = resolved.serverUrl;
			this.#serverUrlInUse = serverUrl;
			this.#leaseInUse = resolved.lease;
		} catch (err: any) {
			const code = typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR';
			const message = typeof err?.message === 'string' ? err.message : String(err);
			this.#lastError = `${code}: ${message}`;
			this.#pushLog('error', 'resolveBridgeServerUrl failed', { code, message, configuredServerUrl: cfg.serverUrl });
			opts.onInfo?.(this.#lastError);
			this.#setState('disconnected');
			return;
		}

		const connectTimeoutMs = 8_000;
		let helloProject: RpcHello['project'] = this.#leaseInUse?.project;
		if (!helloProject) {
			try {
				const info = (await eda.dmt_Project.getCurrentProjectInfo()) as any;
				const uuid = typeof info?.uuid === 'string' ? info.uuid : undefined;
				const name = typeof info?.name === 'string' ? info.name : undefined;
				const friendlyName = typeof info?.friendlyName === 'string' ? info.friendlyName : undefined;
				if (uuid || name || friendlyName) helloProject = { uuid, name, friendlyName };
			} catch {
				// ignore
			}
		}
		let helloPort: number | undefined = this.#leaseInUse?.port;
		if (!helloPort) {
			try {
				const u = new URL(serverUrl);
				const p = Number(u.port);
				if (Number.isFinite(p) && p > 0) helloPort = p;
			} catch {
				// ignore
			}
		}

		this.#handshakeOk = false;
		this.#clearHandshakeTimer();
		this.#lastServerRequestAt = undefined;

		const runtime = loadRuntimeState();
		if (runtime && runtime.connectionState !== 'disconnected') {
			const sameUrl = typeof runtime.serverUrl === 'string' && runtime.serverUrl === serverUrl;
			if (sameUrl) {
				const age = Date.now() - runtime.updatedAt;
				const trafficAge = runtime.lastServerRequestAt ? Date.now() - runtime.lastServerRequestAt : undefined;
				// Avoid registering SYS_WebSocket repeatedly across different extension sandboxes.
				const shouldAssumeAnotherSandboxOwnsConnection =
					(runtime.connectionState === 'connecting' && age < 12_000) ||
					(runtime.connectionState === 'connected' && trafficAge !== undefined && trafficAge < 20_000);
				if (shouldAssumeAnotherSandboxOwnsConnection) {
					opts.onInfo?.(runtime.connectionState === 'connected' ? 'MCP bridge already connected.' : 'MCP bridge is connecting...');
					return;
				}
			}
		}

		this.#pushLog('info', 'connect() called', { serverUrl, configuredServerUrl: cfg.serverUrl, lease: this.#leaseInUse });

		const preferSys = this.#hasSysWebSocket();
		this.#transport = preferSys
			? 'sys_WebSocket'
			: typeof (globalThis as any).WebSocket === 'function'
				? 'globalWebSocket'
				: 'none';
		this.#persistRuntime(true);

		this.#lastError = undefined;
		if (this.#transport === 'none') {
			this.#lastError = 'No WebSocket API available in this EDA environment';
			this.#pushLog('error', this.#lastError);
			opts.onInfo?.(this.#lastError);
			return;
		}

		// Prefer SYS_WebSocket in JLCEDA Pro (native WebSocket may be unavailable in the sandbox).
		if (this.#transport === 'sys_WebSocket') {
			// If URL changed, ensure old connection is closed; SYS_WebSocket keeps ID state internally.
			if (this.#registeredUrl && this.#registeredUrl !== serverUrl) {
				try {
					(eda as any).sys_WebSocket.close(BridgeClient.SYS_WS_ID, 1000, 'Reconfigure');
				} catch {
					// ignore
				}
			}

			this.#registeredUrl = serverUrl;
			this.#setState('connecting');
			opts.onInfo?.(`Connecting to ${serverUrl}...`);
			this.#pushLog('info', 'sys_WebSocket.register', { id: BridgeClient.SYS_WS_ID, url: serverUrl });

			if (this.#connectTimer) clearTimeout(this.#connectTimer);
			this.#connectTimer = setTimeout(() => {
				if (this.#connectionState !== 'connecting') return;
				this.#lastError = `Connect timeout after ${connectTimeoutMs}ms (url ${serverUrl}). Is the bridge server running and reachable?`;
				this.#pushLog('error', 'connect timeout', { timeoutMs: connectTimeoutMs, url: serverUrl, transport: 'sys_WebSocket' });
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
				this.#markServerTraffic();
				if (!this.#handshakeOk) {
					this.#handshakeOk = true;
					this.#autoBackoffMs = AUTO_BASE_BACKOFF_MS;
					this.#clearHandshakeTimer();
					this.#pushLog('info', 'handshake confirmed (first server request)', { method: msg.method });
					this.#setState('connected');
					opts.onInfo?.(`Connected to ${serverUrl}`);
				}

				void this.#enqueueRequest(async () => {
					try {
						const result = await opts.onRequest(msg.method, msg.params);
						const response: RpcResponse = { type: 'response', id: msg.id, result };
						(eda as any).sys_WebSocket.send(BridgeClient.SYS_WS_ID, toJson(response));
						if (msg.closeAfterResponse) {
							this.#pushLog('info', 'closeAfterResponse requested; disconnecting', { id: msg.id, method: msg.method });
							setTimeout(() => this.disconnect(), 10);
						}
					} catch (err: any) {
						const code = typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR';
						const message = typeof err?.message === 'string' ? err.message : String(err);
						const data2 = err?.data;
						const response: RpcResponse = { type: 'response', id: msg.id, error: { code, message, data: data2 } };
						(eda as any).sys_WebSocket.send(BridgeClient.SYS_WS_ID, toJson(response));
						if (msg.closeAfterResponse) {
							this.#pushLog('info', 'closeAfterResponse requested (after error); disconnecting', { id: msg.id, method: msg.method, code });
							setTimeout(() => this.disconnect(), 10);
						}
					}
				});
			};

			const onConnected = () => {
				if (this.#connectTimer) clearTimeout(this.#connectTimer);
				this.#connectTimer = undefined;
				this.#lastConnectedAt = Date.now();
				this.#pushLog('info', 'sys_WebSocket connected', { url: serverUrl });

				let edaVersion: string | undefined;
				try {
					edaVersion = eda.sys_Environment.getEditorCurrentVersion();
				} catch {
					// ignore
				}

				const hello: RpcHello = {
					type: 'hello',
					app: { name: extensionConfig.name, version: extensionConfig.version, edaVersion },
					project: helloProject,
					server: { url: serverUrl, port: helloPort },
				};
				try {
					(eda as any).sys_WebSocket.send(BridgeClient.SYS_WS_ID, toJson(hello));
					this.#pushLog('debug', 'hello sent', { app: hello.app, transport: 'sys_WebSocket' });
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					this.#lastError = `WebSocket send failed: ${msg}`;
					this.#pushLog('error', 'hello send failed', { error: msg });
				}

				this.#startHandshakeWatchdog(serverUrl, opts);
				// Ensure connected/hello logs are persisted even if state changes quickly.
				this.#persistRuntime(true);
			};

			try {
				(eda as any).sys_WebSocket.register(BridgeClient.SYS_WS_ID, serverUrl, onMessage, onConnected);
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
		opts.onInfo?.(`Connecting to ${serverUrl}...`);

		let ws: WebSocket;
		try {
			ws = new (globalThis as any).WebSocket(serverUrl);
		} catch (err) {
			this.#setState('disconnected');
			const msg = err instanceof Error ? err.message : String(err);
			this.#lastError = `WebSocket constructor failed (url ${serverUrl}): ${msg}`;
			this.#pushLog('error', 'WebSocket constructor failed', { error: msg });
			opts.onInfo?.(this.#lastError);
			return;
		}

		this.#socket = ws;
		this.#pushLog('debug', 'WebSocket created', { url: serverUrl, readyState: (ws as any).readyState });

		if (this.#connectTimer) clearTimeout(this.#connectTimer);
		this.#connectTimer = setTimeout(() => {
			const ws = this.#socket;
			if (!ws) return;
			if ((ws as any).readyState !== (globalThis as any).WebSocket.CONNECTING) return;

			this.#lastError = `Connect timeout after ${connectTimeoutMs}ms (url ${serverUrl}). Is the bridge server running and reachable?`;
			this.#pushLog('error', 'connect timeout', { timeoutMs: connectTimeoutMs, url: serverUrl, transport: 'globalWebSocket' });
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
			this.#pushLog('info', 'WebSocket onopen', { url: serverUrl });
			let edaVersion: string | undefined;
			try {
				edaVersion = eda.sys_Environment.getEditorCurrentVersion();
			} catch {
				// ignore
			}
			const hello: RpcHello = {
				type: 'hello',
				app: { name: extensionConfig.name, version: extensionConfig.version, edaVersion },
				project: helloProject,
				server: { url: serverUrl, port: helloPort },
			};
			(ws as any).send(toJson(hello));
			this.#pushLog('debug', 'hello sent', { app: hello.app });
			this.#startHandshakeWatchdog(serverUrl, opts);
			this.#persistRuntime(true);
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
			this.#markServerTraffic();
			if (!this.#handshakeOk) {
				this.#handshakeOk = true;
				this.#autoBackoffMs = AUTO_BASE_BACKOFF_MS;
				this.#clearHandshakeTimer();
				this.#pushLog('info', 'handshake confirmed (first server request)', { method: msg.method });
				this.#setState('connected');
				opts.onInfo?.(`Connected to ${serverUrl}`);
			}

			const ws = this.#socket;
			if (!ws) return;

			void this.#enqueueRequest(async () => {
				try {
					const result = await opts.onRequest(msg.method, msg.params);
					const response: RpcResponse = { type: 'response', id: msg.id, result };
					(ws as any).send(toJson(response));
					if (msg.closeAfterResponse) {
						this.#pushLog('info', 'closeAfterResponse requested; disconnecting', { id: msg.id, method: msg.method });
						setTimeout(() => this.disconnect(), 10);
					}
				} catch (err: any) {
					const code = typeof err?.code === 'string' ? err.code : 'INTERNAL_ERROR';
					const message = typeof err?.message === 'string' ? err.message : String(err);
					const data = err?.data;
					const response: RpcResponse = { type: 'response', id: msg.id, error: { code, message, data } };
					(ws as any).send(toJson(response));
					if (msg.closeAfterResponse) {
						this.#pushLog('info', 'closeAfterResponse requested (after error); disconnecting', { id: msg.id, method: msg.method, code });
						setTimeout(() => this.disconnect(), 10);
					}
				}
			});
		};

		this.#socket.onerror = () => {
			if (this.#connectTimer) clearTimeout(this.#connectTimer);
			this.#connectTimer = undefined;
			this.#clearHandshakeTimer();
			this.#handshakeOk = false;
			this.#lastError = `WebSocket error (url ${serverUrl})`;
			this.#pushLog('error', 'WebSocket onerror', { url: serverUrl });
			opts.onInfo?.(this.#lastError);
		};

		this.#socket.onclose = (ev) => {
			if (this.#connectTimer) clearTimeout(this.#connectTimer);
			this.#connectTimer = undefined;
			this.#clearHandshakeTimer();
			this.#handshakeOk = false;
			const reason = (ev as any)?.reason ? String((ev as any).reason) : '';
			this.#lastError = `Disconnected (code ${(ev as any)?.code ?? 'unknown'}${reason ? `: ${reason}` : ''})`;
			this.#pushLog('warn', 'WebSocket onclose', { code: (ev as any)?.code, reason, url: serverUrl });
			opts.onInfo?.(this.#lastError);
			this.#socket = undefined;
			this.#setState('disconnected');
		};
	}

	disconnect(opts?: { onInfo?: (msg: string) => void; preserveLastError?: boolean }): void {
		const ws = this.#socket;
		if (this.#connectTimer) clearTimeout(this.#connectTimer);
		this.#connectTimer = undefined;
		this.#clearHandshakeTimer();
		this.#handshakeOk = false;
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
			if (!opts?.preserveLastError) this.#lastError = undefined;
			this.#lastServerRequestAt = undefined;
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
		if (!opts?.preserveLastError) this.#lastError = undefined;
		this.#lastServerRequestAt = undefined;
		this.#setState('disconnected');
		opts?.onInfo?.('Disconnected.');
	}

	dispose(): void {
		this.stopAutoConnect();
		this.disconnect();
	}
}

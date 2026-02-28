import { loadBridgeConfig, saveBridgeConfig } from './bridge/config';
import { HEADER_MENUS } from './bridge/headerMenus';
import { showInfo, showToast, inputText } from './bridge/ui';
import { BridgeClient } from './bridge/wsClient';
import { handleRpc } from './handlers';

const bridge = new BridgeClient();
let autoStarted = false;

function ensureAutoConnectStarted(): void {
	if (autoStarted) return;
	autoStarted = true;

	bridge.startAutoConnect({
		onInfo: (msg) => showToast(msg, msg.startsWith('Connected to') ? 'success' : 'error', 4),
		onRequest: async (method, params) => {
			return await handleRpc(method, params, { getStatus: () => bridge.getStatusSnapshot() });
		},
	});
}

function connectNow(): void {
	bridge.connect({
		onInfo: (msg) => showToast(msg, msg.startsWith('Connected to') ? 'success' : 'info', 4),
		onRequest: async (method, params) => {
			return await handleRpc(method, params, { getStatus: () => bridge.getStatusSnapshot() });
		},
	});
}

export function activate(): void {
	// Always auto-connect on startup (hard-coded).
	// Ensure header menus are visible even if the extension manager fails to inject `headerMenus` from extension.json.
	ensureAutoConnectStarted();

	try {
		void eda.sys_HeaderMenu.replaceHeaderMenus(HEADER_MENUS as any).catch((err: unknown) => {
			// Non-fatal; the extension can still be used via command invocation if menus are injected elsewhere.
			showToast(`Failed to register header menus: ${(err as Error)?.message || String(err)}`, 'warn', 6);
		});
	} catch (err) {
		// Non-fatal; the extension can still be used via command invocation if menus are injected elsewhere.
		showToast(`Failed to register header menus: ${(err as Error)?.message || String(err)}`, 'warn', 6);
	}

	try {
		const editorVersion = eda.sys_Environment.getEditorCurrentVersion();
		showToast(`MCP Bridge loaded (EDA ${editorVersion}).`, 'info', 3);
	} catch {
		showToast('MCP Bridge loaded.', 'info', 3);
	}
}

export function deactivate(): void {
	try {
		eda.sys_HeaderMenu.removeHeaderMenus();
	} catch {
		// ignore
	}
	bridge.dispose();
}

export function mcpConnect(): void {
	ensureAutoConnectStarted();
	// Trigger an immediate connection attempt for manual usage feedback.
	connectNow();
}

export function mcpDisconnect(): void {
	bridge.disconnect({ onInfo: (msg) => showToast(msg, 'info', 3) });
}

export function mcpStatus(): void {
	ensureAutoConnectStarted();
	showInfo(JSON.stringify(bridge.getStatusSnapshot(), null, 2));
}

export function mcpDiagnostics(): void {
	ensureAutoConnectStarted();
	const status = bridge.getStatusSnapshot();
	const debugLog = bridge.getDebugLog();

	let editorVersion: string | undefined;
	let compiledDate: string | undefined;
	try {
		editorVersion = eda.sys_Environment.getEditorCurrentVersion();
		compiledDate = eda.sys_Environment.getEditorCompliedDate();
	} catch {
		// ignore
	}

	showInfo(
		JSON.stringify(
			{
				...status,
				eda: { editorVersion, compiledDate },
				debugLog,
			},
			null,
			2,
		),
	);
}

export async function mcpConfigure(): Promise<void> {
	ensureAutoConnectStarted();
	const cfg = loadBridgeConfig();

	const status = bridge.getStatusSnapshot();
	const afterContent = status.port
		? `当前协商端口: ${status.port}\n当前 serverUrl: ${status.serverUrl}`
		: `当前 serverUrl: ${status.serverUrl}`;
	const url = await inputText('MCP Bridge', 'WebSocket URL（保持 9050-9059 范围内可自动分配端口；实际端口看 Status）', cfg.serverUrl, {
		type: 'url',
		placeholder: 'ws://127.0.0.1:9050',
		afterContent,
	});
	if (typeof url === 'string' && url.trim()) cfg.serverUrl = url.trim();

	await saveBridgeConfig(cfg);
	showToast('Saved. Reconnecting...', 'success', 3);

	// Apply immediately: drop current connection and trigger an immediate reconnect attempt.
	try {
		bridge.disconnect({ preserveLastError: true });
	} catch {
		// ignore
	}
	bridge.connect({
		onInfo: (msg) => showToast(msg, msg.startsWith('Connected to') ? 'success' : 'info', 4),
		onRequest: async (method, params) => {
			return await handleRpc(method, params, { getStatus: () => bridge.getStatusSnapshot() });
		},
	});
}

import { loadBridgeConfig, saveBridgeConfig } from './bridge/config';
import { HEADER_MENUS } from './bridge/headerMenus';
import { showInfo, showToast, inputText, selectOne } from './bridge/ui';
import { BridgeClient } from './bridge/wsClient';
import { handleRpc } from './handlers';

const bridge = new BridgeClient();

export function activate(): void {
	// Auto-connect by default (can be disabled in config).
	// Ensure header menus are visible even if the extension manager fails to inject `headerMenus` from extension.json.
	void (async () => {
		try {
			await eda.sys_HeaderMenu.replaceHeaderMenus(HEADER_MENUS as any);
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

		const cfg = loadBridgeConfig();
		if (cfg.autoConnect !== false) {
			bridge.startAutoConnect({
				onInfo: (msg) => showToast(msg, msg.startsWith('Connected to') ? 'success' : 'error', 4),
				onRequest: async (method, params) => {
					return await handleRpc(method, params, { getStatus: () => bridge.getStatusSnapshot() });
				},
			});
		}
	})();
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
	bridge.startAutoConnect({
		onInfo: (msg) => showToast(msg, msg.startsWith('Connected to') ? 'success' : 'info', 4),
		onRequest: async (method, params) => {
			return await handleRpc(method, params, { getStatus: () => bridge.getStatusSnapshot() });
		},
	});
	// Trigger an immediate connection attempt for manual usage feedback.
	bridge.connect({
		onInfo: (msg) => showToast(msg, msg.startsWith('Connected to') ? 'success' : 'info', 4),
		onRequest: async (method, params) => {
			return await handleRpc(method, params, { getStatus: () => bridge.getStatusSnapshot() });
		},
	});
}

export function mcpDisconnect(): void {
	bridge.stopAutoConnect();
	bridge.disconnect({ onInfo: (msg) => showToast(msg, 'info', 3) });
}

export function mcpStatus(): void {
	showInfo(JSON.stringify(bridge.getStatusSnapshot(), null, 2));
}

export function mcpDiagnostics(): void {
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
	const cfg = loadBridgeConfig();

	const url = await inputText('MCP Bridge', 'WebSocket URL', cfg.serverUrl, { type: 'url', placeholder: 'ws://127.0.0.1:9050' });
	if (typeof url === 'string' && url.trim()) cfg.serverUrl = url.trim();

	await new Promise((r) => setTimeout(r, 150));
	const auto = await selectOne(
		'MCP Bridge',
		'Auto-connect on EDA startup?',
		[
			{ value: 'keep', displayContent: 'Keep current' },
			{ value: 'on', displayContent: 'ON (recommended)' },
			{ value: 'off', displayContent: 'OFF' },
		],
		'keep',
	);
	if (auto === 'on') cfg.autoConnect = true;
	if (auto === 'off') cfg.autoConnect = false;

	await saveBridgeConfig(cfg);
	showToast('Saved. Reconnect to apply.', 'success', 3);
}

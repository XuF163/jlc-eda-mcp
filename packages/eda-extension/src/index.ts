import { loadBridgeConfig, saveBridgeConfig } from './bridge/config';
import { HEADER_MENUS } from './bridge/headerMenus';
import { showInfo, inputText } from './bridge/ui';
import { BridgeClient } from './bridge/wsClient';
import { handleRpc } from './handlers';

const bridge = new BridgeClient();

export function activate(): void {
	// Do not auto-connect; user controls it via menu.
	// Ensure header menus are visible even if the extension manager fails to inject `headerMenus` from extension.json.
	void (async () => {
		try {
			await eda.sys_HeaderMenu.replaceHeaderMenus(HEADER_MENUS as any);
		} catch (err) {
			// Non-fatal; the extension can still be used via command invocation if menus are injected elsewhere.
			showInfo(`Failed to register header menus: ${(err as Error)?.message || String(err)}`);
		}

		try {
			const editorVersion = eda.sys_Environment.getEditorCurrentVersion();
			showInfo(`MCP Bridge loaded (EDA ${editorVersion}). Open "MCP Bridge" in the top menu.`);
		} catch {
			showInfo('MCP Bridge loaded. Open "MCP Bridge" in the top menu.');
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
	bridge.connect({
		onInfo: (msg) => showInfo(msg),
		onRequest: async (method, params) => {
			return await handleRpc(method, params, { getStatus: () => bridge.getStatusSnapshot() });
		},
	});
}

export function mcpDisconnect(): void {
	bridge.disconnect({ onInfo: (msg) => showInfo(msg) });
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

	// Some EDA versions need a short delay before opening a second dialog.
	await new Promise((r) => setTimeout(r, 150));

	const token = await inputText('MCP Bridge', 'Bridge token', cfg.token ?? '', {
		type: 'password',
		afterContent: '留空表示服务端不要求 token（或服务端已禁用 token 检查）',
	});
	cfg.token = token?.trim() ? token.trim() : undefined;

	await saveBridgeConfig(cfg);
	showInfo('Saved. Reconnect to apply.');
}

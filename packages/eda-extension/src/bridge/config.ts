export type BridgeConfig = {
	serverUrl: string;
	autoConnect?: boolean;
};

const STORAGE_KEY = 'jlceda_mcp_bridge_config_v1';
export const DEFAULT_SERVER_URL = 'ws://127.0.0.1:9050';

export function loadBridgeConfig(): BridgeConfig {
	try {
		const raw = eda.sys_Storage.getExtensionUserConfig(STORAGE_KEY) as any;
		if (!raw) return { serverUrl: DEFAULT_SERVER_URL, autoConnect: true };

		const serverUrl = typeof raw?.serverUrl === 'string' && raw.serverUrl.trim() ? raw.serverUrl.trim() : DEFAULT_SERVER_URL;
		const autoConnect = typeof raw?.autoConnect === 'boolean' ? raw.autoConnect : true;
		return { serverUrl, autoConnect };
	} catch {
		// Fallback (older builds stored it in localStorage)
		try {
			const raw = (globalThis as any)?.localStorage?.getItem?.(STORAGE_KEY);
			if (!raw) return { serverUrl: DEFAULT_SERVER_URL, autoConnect: true };
			const parsed = JSON.parse(String(raw)) as Partial<BridgeConfig>;
			return {
				serverUrl: parsed.serverUrl || DEFAULT_SERVER_URL,
				autoConnect: typeof parsed.autoConnect === 'boolean' ? parsed.autoConnect : true,
			};
		} catch {
			return { serverUrl: DEFAULT_SERVER_URL, autoConnect: true };
		}
	}
}

export async function saveBridgeConfig(cfg: BridgeConfig): Promise<void> {
	await eda.sys_Storage.setExtensionUserConfig(STORAGE_KEY, cfg);
}

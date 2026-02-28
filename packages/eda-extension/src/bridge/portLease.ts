import { asObject, asOptionalNumber, asOptionalString, rpcError } from './validate';

export type ProjectInfo = {
	uuid: string;
	name?: string;
	friendlyName?: string;
};

export type PortLeaseInfo = {
	port: number;
	project: ProjectInfo;
};

export type PortLeaseSnapshot = {
	port: number;
	projectUuid?: string;
	projectName?: string;
	projectFriendlyName?: string;
	updatedAt?: number;
	ageMs?: number;
	expired?: boolean;
};

const PORT_RANGE_START = 9050;
const PORT_RANGE_END = 9059;
const LEASE_TTL_MS = 45_000;

const PORT_LEASE_PREFIX = 'jlceda_mcp_bridge_port_lease_v1:';

type LeaseStore = {
	kind: 'localStorage' | 'extensionUserConfig';
	get(key: string): unknown;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
};

let CACHED_STORE: LeaseStore | undefined;

function getLeaseStore(): LeaseStore {
	if (CACHED_STORE) return CACHED_STORE;

	try {
		const ls = (globalThis as any)?.localStorage as Storage | undefined;
		if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function' && typeof ls.removeItem === 'function') {
			const store: LeaseStore = {
				kind: 'localStorage',
				get: (key) => {
					try {
						const raw = ls.getItem(key);
						if (!raw) return undefined;
						return JSON.parse(raw) as unknown;
					} catch {
						return undefined;
					}
				},
				set: async (key, value) => {
					try {
						ls.setItem(key, JSON.stringify(value));
					} catch {
						throw rpcError('STORAGE_WRITE_FAILED', `Failed to persist port lease (${key})`);
					}
				},
				delete: async (key) => {
					try {
						ls.removeItem(key);
					} catch {
						// ignore
					}
				},
			};
			CACHED_STORE = store;
			return store;
		}
	} catch {
		// ignore and fallback
	}

	const store: LeaseStore = {
		kind: 'extensionUserConfig',
		get: (key) => {
			try {
				return eda.sys_Storage.getExtensionUserConfig(key);
			} catch {
				return undefined;
			}
		},
		set: async (key, value) => {
			const ok = await eda.sys_Storage.setExtensionUserConfig(key, value);
			if (!ok) throw rpcError('STORAGE_WRITE_FAILED', `Failed to persist port lease (${key})`);
		},
		delete: async (key) => {
			try {
				await eda.sys_Storage.deleteExtensionUserConfig(key);
			} catch {
				// ignore
			}
		},
	};
	CACHED_STORE = store;
	return store;
}

function isLocalHost(hostname: string): boolean {
	const h = hostname.trim().toLowerCase();
	return h === '127.0.0.1' || h === 'localhost';
}

function safeParseWsUrl(raw: string): URL | undefined {
	try {
		const u = new URL(raw);
		if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return undefined;
		return u;
	} catch {
		return undefined;
	}
}

function getLeaseKey(port: number): string {
	return `${PORT_LEASE_PREFIX}${port}`;
}

function isLeaseExpired(updatedAt: number, now: number): boolean {
	return now - updatedAt > LEASE_TTL_MS;
}

function safeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const s = value.trim();
	return s ? s : undefined;
}

function safeOptionalNumber(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	return value;
}

function parseLease(raw: unknown): { projectUuid: string; updatedAt: number } | undefined {
	if (!raw) return undefined;
	try {
		const obj = asObject(raw, 'lease');
		const projectUuid = asOptionalString(obj.projectUuid, 'projectUuid');
		const updatedAt = asOptionalNumber(obj.updatedAt, 'updatedAt');
		if (!projectUuid || !updatedAt || !Number.isFinite(updatedAt)) return undefined;
		return { projectUuid: projectUuid.trim(), updatedAt };
	} catch {
		return undefined;
	}
}

async function writeLease(port: number, project: ProjectInfo, now: number): Promise<void> {
	const key = getLeaseKey(port);
	const value = {
		projectUuid: project.uuid,
		projectName: project.name,
		projectFriendlyName: project.friendlyName,
		updatedAt: now,
	};
	await getLeaseStore().set(key, value);
}

async function releaseOtherLeases(projectUuid: string, keepPort: number): Promise<void> {
	const store = getLeaseStore();
	for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
		if (port === keepPort) continue;
		const key = getLeaseKey(port);
		const current = parseLease(store.get(key));
		if (current?.projectUuid !== projectUuid) continue;
		await store.delete(key);
	}
}

export async function resolveBridgePortLease(configuredServerUrl: string): Promise<PortLeaseInfo | undefined> {
	const url = safeParseWsUrl(configuredServerUrl);
	if (!url) return undefined;
	if (!isLocalHost(url.hostname)) return undefined;

	// Only auto-negotiate when the configured port is within the pool.
	const configuredPort = Number(url.port);
	if (!Number.isFinite(configuredPort) || configuredPort < PORT_RANGE_START || configuredPort > PORT_RANGE_END) return undefined;

	let projectUuid: string | undefined;
	let projectName: string | undefined;
	let projectFriendlyName: string | undefined;
	try {
		const info = (await eda.dmt_Project.getCurrentProjectInfo()) as any;
		projectUuid = typeof info?.uuid === 'string' ? info.uuid : undefined;
		projectName = typeof info?.name === 'string' ? info.name : undefined;
		projectFriendlyName = typeof info?.friendlyName === 'string' ? info.friendlyName : undefined;
	} catch {
		return undefined;
	}

	if (!projectUuid || !projectUuid.trim()) return undefined;
	const project: ProjectInfo = { uuid: projectUuid.trim(), name: projectName, friendlyName: projectFriendlyName };

	const now = Date.now();
	const store = getLeaseStore();

	// 1) Reuse an existing valid lease for this project.
	for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
		const key = getLeaseKey(port);
		const current = parseLease(store.get(key));
		if (!current) continue;
		if (isLeaseExpired(current.updatedAt, now)) continue;
		if (current.projectUuid !== project.uuid) continue;
		await writeLease(port, project, now);
		await releaseOtherLeases(project.uuid, port);
		return { port, project };
	}

	// 2) Claim the first free / expired port.
	const tryClaim = async (port: number): Promise<PortLeaseInfo | undefined> => {
		const key = getLeaseKey(port);
		const current = parseLease(store.get(key));
		if (current && !isLeaseExpired(current.updatedAt, now)) return undefined;

		await writeLease(port, project, now);
		const after = parseLease(store.get(key));
		if (after?.projectUuid !== project.uuid) return undefined;

		await releaseOtherLeases(project.uuid, port);
		return { port, project };
	};

	for (let port = configuredPort; port <= PORT_RANGE_END; port++) {
		const claimed = await tryClaim(port);
		if (claimed) return claimed;
	}
	for (let port = PORT_RANGE_START; port < configuredPort; port++) {
		const claimed = await tryClaim(port);
		if (claimed) return claimed;
	}

	throw rpcError(
		'NO_AVAILABLE_PORT',
		`No free ports available in ${PORT_RANGE_START}-${PORT_RANGE_END}. Close extra EDA windows or change the configured port outside this range.`,
	);
}

export async function refreshBridgePortLease(port: number, projectUuid: string): Promise<void> {
	if (!Number.isFinite(port) || port < PORT_RANGE_START || port > PORT_RANGE_END) return;
	const key = getLeaseKey(port);
	const now = Date.now();
	const store = getLeaseStore();
	const raw = store.get(key);
	const current = parseLease(raw);
	if (!current || current.projectUuid !== projectUuid) return;
	if (isLeaseExpired(current.updatedAt, now)) return;
	try {
		const obj = asObject(raw, 'lease');
		await store.set(key, { ...obj, updatedAt: now });
	} catch {
		// ignore
	}
}

export async function resolveBridgeServerUrl(configuredServerUrl: string): Promise<{ serverUrl: string; lease?: PortLeaseInfo }> {
	const lease = await resolveBridgePortLease(configuredServerUrl);
	if (!lease) return { serverUrl: configuredServerUrl };

	const url = safeParseWsUrl(configuredServerUrl);
	if (!url) return { serverUrl: configuredServerUrl };
	url.port = String(lease.port);
	return { serverUrl: url.toString(), lease };
}

export function listBridgePortLeases(): Array<PortLeaseSnapshot> {
	const now = Date.now();
	const store = getLeaseStore();
	const out: Array<PortLeaseSnapshot> = [];
	for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
		const raw = store.get(getLeaseKey(port));
		if (!raw) continue;
		try {
			const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as any) : undefined;
			if (!obj) continue;

			const updatedAt = safeOptionalNumber(obj.updatedAt);
			out.push({
				port,
				projectUuid: safeOptionalString(obj.projectUuid),
				projectName: safeOptionalString(obj.projectName),
				projectFriendlyName: safeOptionalString(obj.projectFriendlyName),
				updatedAt,
				ageMs: updatedAt !== undefined ? now - updatedAt : undefined,
				expired: updatedAt !== undefined ? isLeaseExpired(updatedAt, now) : undefined,
			});
		} catch {
			// ignore bad record
		}
	}
	return out;
}

import { asObject, asOptionalNumber, asOptionalString, asString, rpcError } from './validate';

export type ProjectInfo = {
	uuid: string;
	name?: string;
	friendlyName?: string;
};

export type PortLeaseInfo = {
	port: number;
	project: ProjectInfo;
};

const PORT_RANGE_START = 9050;
const PORT_RANGE_END = 9059;
const LEASE_TTL_MS = 45_000;

const PORT_LEASE_PREFIX = 'jlceda_mcp_bridge_port_lease_v1:';

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

function parseLease(raw: unknown): { projectUuid: string; updatedAt: number } | undefined {
	if (!raw) return undefined;
	const obj = asObject(raw, 'lease');
	const projectUuid = asOptionalString(obj.projectUuid, 'projectUuid');
	const updatedAt = asOptionalNumber(obj.updatedAt, 'updatedAt');
	if (!projectUuid || !updatedAt || !Number.isFinite(updatedAt)) return undefined;
	return { projectUuid: projectUuid.trim(), updatedAt };
}

async function writeLease(port: number, project: ProjectInfo, now: number): Promise<void> {
	const key = getLeaseKey(port);
	const value = {
		projectUuid: project.uuid,
		projectName: project.name,
		projectFriendlyName: project.friendlyName,
		updatedAt: now,
	};
	const ok = await eda.sys_Storage.setExtensionUserConfig(key, value);
	if (!ok) throw rpcError('STORAGE_WRITE_FAILED', `Failed to persist port lease (${port})`);
}

async function releaseOtherLeases(projectUuid: string, keepPort: number): Promise<void> {
	for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
		if (port === keepPort) continue;
		const key = getLeaseKey(port);
		const current = parseLease(eda.sys_Storage.getExtensionUserConfig(key));
		if (current?.projectUuid !== projectUuid) continue;
		try {
			await eda.sys_Storage.deleteExtensionUserConfig(key);
		} catch {
			// ignore
		}
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

	// 1) Reuse an existing valid lease for this project.
	for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
		const key = getLeaseKey(port);
		const current = parseLease(eda.sys_Storage.getExtensionUserConfig(key));
		if (!current) continue;
		if (isLeaseExpired(current.updatedAt, now)) continue;
		if (current.projectUuid !== project.uuid) continue;
		await writeLease(port, project, now);
		await releaseOtherLeases(project.uuid, port);
		return { port, project };
	}

	// 2) Claim the first free / expired port.
	for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
		const key = getLeaseKey(port);
		const current = parseLease(eda.sys_Storage.getExtensionUserConfig(key));
		if (current && !isLeaseExpired(current.updatedAt, now)) continue;

		await writeLease(port, project, now);
		const after = parseLease(eda.sys_Storage.getExtensionUserConfig(key));
		if (after?.projectUuid !== project.uuid) continue;

		await releaseOtherLeases(project.uuid, port);
		return { port, project };
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
	const current = parseLease(eda.sys_Storage.getExtensionUserConfig(key));
	if (!current || current.projectUuid !== projectUuid) return;
	if (isLeaseExpired(current.updatedAt, now)) return;
	try {
		const ok = await eda.sys_Storage.setExtensionUserConfig(key, { ...asObject(eda.sys_Storage.getExtensionUserConfig(key), 'lease'), updatedAt: now });
		void ok;
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


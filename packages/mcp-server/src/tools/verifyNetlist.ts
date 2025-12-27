import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { WsBridge } from '../bridge/wsBridge.js';
import { parseNetlist } from '../netlist/parseNetlist.js';

const NetlistTypeSchema = z.enum(['JLCEDA', 'EasyEDA', 'Protel2', 'PADS', 'Allegro', 'DISA']).optional();

export const VerifyNetlistSchema = z.object({
	netlistType: NetlistTypeSchema,
	timeoutMs: z.number().int().positive().optional().default(30_000),
	maxChars: z.number().int().positive().optional().default(1_000_000),
	nets: z
		.array(
			z.object({
				name: z.string().min(1),
				endpoints: z
					.array(
						z.object({
							ref: z.string().min(1),
							pin: z.string().min(1),
						}),
					)
					.min(1),
			}),
		)
		.min(1),
});

function normalizeNet(name: string): string {
	return String(name).trim().replace(/^"(.*)"$/, '$1').toUpperCase();
}

function normalizeRef(ref: string): string {
	return String(ref).trim().toUpperCase();
}

function normalizePin(pin: string): string {
	return String(pin).trim().toUpperCase();
}

async function getNetlistTextWithFallback(
	bridge: WsBridge,
	opts: { netlistType: string; timeoutMs: number; maxChars: number },
): Promise<{ netlistType: string; netlist: string; truncated: boolean; totalChars: number; source: 'api' | 'export'; savedTo?: string }> {
	const { netlistType, timeoutMs, maxChars } = opts;

	try {
		const netlistRes = (await bridge.call(
			'schematic.getNetlist',
			{ netlistType, maxChars, timeoutMs },
			Math.max(10_000, timeoutMs + 5_000),
		)) as any;

		const netlist = typeof netlistRes?.netlist === 'string' ? netlistRes.netlist : '';
		const totalChars = typeof netlistRes?.totalChars === 'number' ? netlistRes.totalChars : netlist.length;
		const truncated = Boolean(netlistRes?.truncated);
		return { netlistType: netlistRes?.netlistType ?? netlistType, netlist, truncated, totalChars, source: 'api' };
	} catch (err) {
		const anyErr = err as any;
		const code = String(anyErr?.code ?? '');
		if (code !== 'TIMEOUT' && code !== 'NOT_SUPPORTED') throw err;
	}

	// Fallback: export netlist file then read it from disk (often more stable than SCH_Netlist.getNetlist).
	const fileName = `jlceda_mcp_netlist_${Date.now()}_${Math.random().toString(16).slice(2, 10)}.net`;

	let savedTo: string | undefined;

	// Prefer saving into workspace logs for easy debugging. Some EDA setups may restrict paths, so fall back to EDA default path.
	try {
		const baseDir = path.resolve(process.cwd(), '.logs', 'netlist');
		await fs.mkdir(baseDir, { recursive: true });
		const savePath = `${baseDir}${path.sep}`;

		const exported = (await bridge.call('exportSchematicNetlistFile', { netlistType, savePath, fileName, force: true }, 120_000)) as any;
		savedTo = typeof exported?.savedTo === 'string' && exported.savedTo.trim() ? exported.savedTo : path.join(baseDir, fileName);
	} catch {
		const exported = (await bridge.call('exportSchematicNetlistFile', { netlistType, fileName, force: true }, 120_000)) as any;
		savedTo = typeof exported?.savedTo === 'string' && exported.savedTo.trim() ? exported.savedTo : undefined;
	}

	if (!savedTo) throw new Error('Failed to export netlist file (no savedTo returned)');

	const raw = await fs.readFile(savedTo, 'utf8');
	const totalChars = raw.length;

	if (maxChars && Number.isFinite(maxChars) && maxChars > 0 && totalChars > maxChars) {
		return { netlistType, netlist: raw.slice(0, Math.floor(maxChars)), truncated: true, totalChars, source: 'export', savedTo };
	}

	return { netlistType, netlist: raw, truncated: false, totalChars, source: 'export', savedTo };
}

export async function verifyNetlist(bridge: WsBridge, args: z.infer<typeof VerifyNetlistSchema>): Promise<unknown> {
	const timeoutMs = args.timeoutMs ?? 30_000;
	const maxChars = args.maxChars ?? 1_000_000;
	const netlistType = args.netlistType ?? 'JLCEDA';

	const netlistRes = await getNetlistTextWithFallback(bridge, { netlistType, timeoutMs, maxChars });
	const raw = netlistRes.netlist ?? '';
	const parsed = parseNetlist(raw);

	// Build endpoint -> net mapping (best effort)
	const endpointToNet = new Map<string, Array<string>>();
	for (const [net, eps] of Object.entries(parsed.nets)) {
		for (const ep of eps) {
			const key = `${normalizeRef(ep.ref)}.${normalizePin(ep.pin)}`;
			const list = endpointToNet.get(key) ?? [];
			list.push(net);
			endpointToNet.set(key, list);
		}
	}

	const results: Record<
		string,
		{
			ok: boolean;
			netFound: boolean;
			missingEndpoints: Array<{ ref: string; pin: string }>;
			wrongNet: Array<{ ref: string; pin: string; actual: Array<string> }>;
		}
	> = {};

	for (const n of args.nets) {
		const key = normalizeNet(n.name);
		const netFound = Object.prototype.hasOwnProperty.call(parsed.nets, key);
		const endpointSet = new Set((parsed.nets[key] ?? []).map((ep) => `${normalizeRef(ep.ref)}.${normalizePin(ep.pin)}`));

		const missingEndpoints: Array<{ ref: string; pin: string }> = [];
		const wrongNet: Array<{ ref: string; pin: string; actual: Array<string> }> = [];

		for (const e of n.endpoints) {
			const eKey = `${normalizeRef(e.ref)}.${normalizePin(e.pin)}`;
			if (netFound && endpointSet.has(eKey)) continue;

			const actual = endpointToNet.get(eKey) ?? [];
			if (actual.length) {
				wrongNet.push({ ref: e.ref, pin: e.pin, actual });
			} else {
				missingEndpoints.push({ ref: e.ref, pin: e.pin });
			}
		}

		const ok = netFound && missingEndpoints.length === 0 && wrongNet.length === 0;
		results[n.name] = { ok, netFound, missingEndpoints, wrongNet };
	}

	const ok = Object.values(results).every((r) => r.ok) && parsed.ok;
	return {
		ok,
		netlist: {
			netlistType: netlistRes.netlistType ?? netlistType,
			truncated: Boolean(netlistRes.truncated),
			totalChars: Number(netlistRes.totalChars ?? raw.length),
			source: netlistRes.source,
			savedTo: netlistRes.savedTo,
		},
		parsed: {
			ok: parsed.ok,
			formatGuess: parsed.formatGuess,
			warnings: parsed.warnings,
			nets: Object.keys(parsed.nets).length,
		},
		results,
		excerpt: raw.length > 20_000 ? raw.slice(0, 20_000) : raw,
	};
}

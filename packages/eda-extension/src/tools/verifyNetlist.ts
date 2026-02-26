import { z } from 'zod';

import { rpcError, safeFileName } from '../bridge/validate';
import { getNetlist } from '../handlers/schematic';
import { parseNetlist } from './netlist/parseNetlist';

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

async function requireSchematicPage(): Promise<void> {
	const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
	if (!info) throw rpcError('NO_ACTIVE_DOCUMENT', 'No active document');
	if (info.documentType !== 1 /* SCHEMATIC_PAGE */) {
		throw rpcError('NOT_IN_SCHEMATIC_PAGE', 'Current document is not a schematic page');
	}
}

async function blobToText(blob: any): Promise<string> {
	if (!blob) throw new Error('No file/blob returned');

	// Prefer modern Blob/File APIs.
	if (typeof blob.text === 'function') {
		return String(await blob.text());
	}
	if (typeof blob.arrayBuffer === 'function' && typeof (globalThis as any).TextDecoder === 'function') {
		const buf = await blob.arrayBuffer();
		const dec = new (globalThis as any).TextDecoder('utf-8');
		return dec.decode(buf);
	}

	// Fallback to FileReader if available.
	const FileReaderCtor = (globalThis as any).FileReader;
	if (typeof FileReaderCtor === 'function') {
		return await new Promise<string>((resolve, reject) => {
			const r = new FileReaderCtor();
			r.onerror = () => reject(new Error('FileReader failed'));
			r.onload = () => resolve(String(r.result ?? ''));
			r.readAsText(blob);
		});
	}

	throw new Error('Cannot read netlist file content in this EDA environment');
}

async function getNetlistTextWithFallback(opts: {
	netlistType: string;
	timeoutMs: number;
	maxChars: number;
}): Promise<{ netlistType: string; netlist: string; truncated: boolean; totalChars: number; source: 'api' | 'export' }> {
	const { netlistType, timeoutMs, maxChars } = opts;

	try {
		const netlistRes = (await getNetlist({ netlistType, maxChars, timeoutMs })) as any;
		const netlist = typeof netlistRes?.netlist === 'string' ? netlistRes.netlist : '';
		const totalChars = typeof netlistRes?.totalChars === 'number' ? netlistRes.totalChars : netlist.length;
		const truncated = Boolean(netlistRes?.truncated);
		return { netlistType: netlistRes?.netlistType ?? netlistType, netlist, truncated, totalChars, source: 'api' };
	} catch (err) {
		const anyErr = err as any;
		const code = String(anyErr?.code ?? '');
		if (code !== 'TIMEOUT' && code !== 'NOT_SUPPORTED') throw err;
	}

	// Fallback: export netlist as a File/Blob and read it directly (no disk access required).
	await requireSchematicPage();
	const fileName = safeFileName(`jlceda_mcp_netlist_${Date.now()}_${Math.random().toString(16).slice(2, 10)}.net`);
	const file = await eda.sch_ManufactureData.getNetlistFile(fileName, netlistType as any);
	if (!file) throw new Error('Failed to export netlist file');

	const raw = await blobToText(file);
	const totalChars = raw.length;

	if (maxChars && Number.isFinite(maxChars) && maxChars > 0 && totalChars > maxChars) {
		return { netlistType, netlist: raw.slice(0, Math.floor(maxChars)), truncated: true, totalChars, source: 'export' };
	}

	return { netlistType, netlist: raw, truncated: false, totalChars, source: 'export' };
}

export async function verifyNetlist(args: z.infer<typeof VerifyNetlistSchema>): Promise<unknown> {
	const timeoutMs = args.timeoutMs ?? 30_000;
	const maxChars = args.maxChars ?? 1_000_000;
	const netlistType = args.netlistType ?? 'JLCEDA';

	const netlistRes = await getNetlistTextWithFallback({ netlistType, timeoutMs, maxChars });
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


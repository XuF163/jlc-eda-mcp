import { z } from 'zod';

import type { WsBridge } from '../bridge/wsBridge.js';
import { bfsReachable, buildAdjacency, parseWiresFromDocumentSource, pointKey, type WireSeg } from '../netlist/docSourceWires.js';

type Pin = { x: number; y: number; pinNumber?: string; pinName?: string };

function normalize(s: string): string {
	return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function selectPins(
	pins: Array<Pin>,
	selector: { pinNumber?: string; pinName?: string; allowMany?: boolean },
): Array<Pin> {
	const allowMany = selector.allowMany ?? false;

	if (selector.pinNumber) {
		const n = String(selector.pinNumber);
		const matched = pins.filter((p) => String(p.pinNumber) === n);
		if (matched.length === 0) throw new Error(`Pin not found: pinNumber=${n}`);
		return [matched[0]];
	}

	if (selector.pinName) {
		const want = normalize(selector.pinName);
		const matched = pins.filter((p) => p.pinName && normalize(p.pinName) === want);
		if (matched.length === 1) return [matched[0]];
		if (allowMany && matched.length >= 1) return matched;

		// fallback: substring match
		const matched2 = pins.filter((p) => p.pinName && normalize(p.pinName).includes(want));
		if (matched2.length === 1) return [matched2[0]];
		if (allowMany && matched2.length >= 1) return matched2;

		if (matched.length > 1 || matched2.length > 1) throw new Error(`Ambiguous pinName=${selector.pinName}`);
		throw new Error(`Pin not found: pinName=${selector.pinName}`);
	}

	throw new Error('pinNumber or pinName is required');
}

export const VerifyNetsSchema = z.object({
	nets: z.array(
		z.object({
			name: z.string().min(1),
			wirePrimitiveIds: z.array(z.string().min(1)).optional(),
			points: z.array(
				z
					.object({
						ref: z.string().min(1).optional(),
						x: z.number().optional(),
						y: z.number().optional(),
						primitiveId: z.string().min(1).optional(),
						pinNumber: z.string().min(1).optional(),
						pinName: z.string().min(1).optional(),
						allowMany: z.boolean().optional(),
					})
					.superRefine((v, ctx) => {
						const hasXY = typeof v.x === 'number' && typeof v.y === 'number';
						const hasPinRef = typeof v.primitiveId === 'string' && (typeof v.pinNumber === 'string' || typeof v.pinName === 'string');
						if (!hasXY && !hasPinRef) {
							ctx.addIssue({
								code: z.ZodIssueCode.custom,
								message: 'Provide either (x,y) or (primitiveId + (pinNumber|pinName)).',
							});
						}
					}),
			),
		}),
	),
	requireConnected: z.boolean().optional().default(true),
	maxChars: z.number().int().positive().optional().default(800_000),
	timeoutMs: z.number().int().positive().optional().default(60_000),
});

export async function verifyNets(bridge: WsBridge, args: z.infer<typeof VerifyNetsSchema>): Promise<unknown> {
	const requireConnected = args.requireConnected ?? true;
	const maxChars = args.maxChars ?? 800_000;
	const timeoutMs = args.timeoutMs ?? 60_000;

	const netNames = new Set(args.nets.map((n) => n.name));
	const wireIds = new Set<string>();
	for (const n of args.nets) for (const id of n.wirePrimitiveIds ?? []) wireIds.add(id);

	const doc = (await bridge.call('getDocumentSource', { maxChars }, timeoutMs)) as any;
	const sourceText = typeof doc?.source === 'string' ? doc.source : '';
	if (!sourceText) throw new Error('No document source returned');

	const parsed = parseWiresFromDocumentSource(sourceText, wireIds.size ? { wireIds } : { netNames });

	const pinsCache = new Map<string, Array<Pin>>();
	const getPins = async (primitiveId: string): Promise<Array<Pin>> => {
		const cached = pinsCache.get(primitiveId);
		if (cached) return cached;
		const res = (await bridge.call('schematic.getComponentPins', { primitiveId }, 30_000)) as any;
		const list = Array.isArray(res?.pins) ? res.pins : [];
		const pins = list.map((p: any) => ({
			x: Number(p?.x),
			y: Number(p?.y),
			pinNumber: p?.pinNumber != null ? String(p.pinNumber) : undefined,
			pinName: p?.pinName != null ? String(p.pinName) : undefined,
		}));
		pinsCache.set(primitiveId, pins);
		return pins;
	};

	const toDoc = (p: { x: number; y: number }): { x: number; y: number } => ({ x: Number(p.x), y: -Number(p.y) });

	const results: Record<
		string,
		{
			ok: boolean;
			wires: number;
			segments: number;
			missingWireIds: Array<string>;
			netMismatch: Array<{ wireId: string; expected: string; actual?: string }>;
			missingPoints: Array<string>;
			disconnected: Array<string>;
		}
	> = {};

	for (const net of args.nets) {
		const expectedPoints: Array<{ x: number; y: number; ref: string }> = [];

		for (const p of net.points) {
			if (typeof p.x === 'number' && typeof p.y === 'number') {
				const docPt = toDoc({ x: p.x, y: p.y });
				expectedPoints.push({ ...docPt, ref: p.ref ?? `(${p.x},${p.y})` });
				continue;
			}

			const primitiveId = String(p.primitiveId);
			const pins = await getPins(primitiveId);
			const selected = selectPins(pins, { pinNumber: p.pinNumber, pinName: p.pinName, allowMany: p.allowMany });
			for (const sp of selected) {
				const docPt = toDoc({ x: sp.x, y: sp.y });
				const ref = p.ref ?? `${primitiveId}.${sp.pinName ?? sp.pinNumber ?? '?'}`;
				expectedPoints.push({ ...docPt, ref });
			}
		}

		const wantWireIds = net.wirePrimitiveIds ?? [];
		const missingWireIds = wantWireIds.filter((id) => !parsed.has(id));
		const netMismatch: Array<{ wireId: string; expected: string; actual?: string }> = [];

		const segments: Array<WireSeg> = [];
		if (wantWireIds.length) {
			for (const id of wantWireIds) {
				const w = parsed.get(id);
				if (!w) continue;
				if (w.net && w.net !== net.name) netMismatch.push({ wireId: id, expected: net.name, actual: w.net });
				segments.push(...w.segments);
			}
		} else {
			for (const w of parsed.values()) {
				if (w.net !== net.name) continue;
				segments.push(...w.segments);
			}
		}

		const adj = buildAdjacency(segments);
		const expectedKeys = expectedPoints.map((p) => ({ key: pointKey(p.x, p.y), ref: p.ref }));
		const missingPoints = expectedKeys.filter((p) => !adj.has(p.key)).map((p) => `${p.ref}@${p.key}`);

		let disconnected: Array<string> = [];
		if (requireConnected && expectedKeys.length >= 2) {
			const start = expectedKeys.find((p) => adj.has(p.key))?.key;
			if (start) {
				const reachable = bfsReachable(adj, start);
				disconnected = expectedKeys.filter((p) => adj.has(p.key) && !reachable.has(p.key)).map((p) => `${p.ref}@${p.key}`);
			} else {
				disconnected = expectedKeys.map((p) => `${p.ref}@${p.key}`);
			}
		}

		const ok = missingWireIds.length === 0 && netMismatch.length === 0 && missingPoints.length === 0 && disconnected.length === 0;
		results[net.name] = {
			ok,
			wires: wantWireIds.length ? wantWireIds.length : Array.from(parsed.values()).filter((w) => w.net === net.name).length,
			segments: segments.length,
			missingWireIds,
			netMismatch,
			missingPoints,
			disconnected,
		};
	}

	return { ok: Object.values(results).every((r) => r.ok), results, doc: { truncated: Boolean(doc?.truncated), totalChars: Number(doc?.totalChars ?? sourceText.length) } };
}


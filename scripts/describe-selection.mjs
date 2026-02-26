#!/usr/bin/env node
/**
 * Describe current schematic selection via jlceda-eda-mcp HTTP server.
 *
 * Usage:
 *   NO_PROXY='*' node scripts/describe-selection.mjs
 *
 * Optional env:
 *   JLCEDA_HTTP_BASE=http://127.0.0.1:9151
 *   JLCEDA_HTTP_TOKEN=...
 */

const BASE = process.env.JLCEDA_HTTP_BASE?.trim() || 'http://127.0.0.1:9151';
const TOKEN = process.env.JLCEDA_HTTP_TOKEN?.trim() || '';
const FULL = process.argv.includes('--full') || process.env.JLCEDA_FULL === '1';
const PROBE_UNKNOWN = FULL || process.argv.includes('--probe') || process.env.JLCEDA_PROBE_UNKNOWN === '1';
const SHOW_ALL = FULL || process.argv.includes('--all') || process.env.JLCEDA_SHOW_ALL === '1';
const INCLUDE_PINS = FULL || process.argv.includes('--pins') || process.env.JLCEDA_INCLUDE_PINS === '1';
const PROBE_ALL = FULL || process.argv.includes('--probe-all') || process.env.JLCEDA_PROBE_ALL === '1';

function parsePositiveIntArg(flag, fallback) {
	const i = process.argv.indexOf(flag);
	if (i !== -1) {
		const v = Number(process.argv[i + 1]);
		if (Number.isFinite(v) && v > 0) return Math.floor(v);
	}
	const envKey = flag.replace(/^--/, 'JLCEDA_').toUpperCase().replace(/-/g, '_');
	const env = Number(process.env[envKey]);
	if (Number.isFinite(env) && env > 0) return Math.floor(env);
	return fallback;
}

const MAX_ITEMS = SHOW_ALL ? Number.MAX_SAFE_INTEGER : parsePositiveIntArg('--max', 30);
const MAX_UNKNOWN_IDS = SHOW_ALL ? Number.MAX_SAFE_INTEGER : parsePositiveIntArg('--max-unknown', 50);
const PROBE_LIMIT = (() => {
	const i = process.argv.indexOf('--probe-limit');
	if (i !== -1) {
		const v = Number(process.argv[i + 1]);
		if (Number.isFinite(v) && v > 0) return Math.floor(v);
	}
	const env = Number(process.env.JLCEDA_PROBE_LIMIT);
	if (Number.isFinite(env) && env > 0) return Math.floor(env);
	return 20;
})();

function makeHeaders() {
	const headers = { 'content-type': 'application/json' };
	if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
	return headers;
}

async function httpGetJson(path) {
	const url = new URL(path, BASE).toString();
	const res = await fetch(url, { headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : undefined });
	const text = await res.text();
	let json;
	try {
		json = text ? JSON.parse(text) : undefined;
	} catch {
		throw new Error(`HTTP ${res.status} ${res.statusText}: ${text || '<empty>'}`);
	}
	if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
	return json;
}

async function toolCall(name, args = {}) {
	const url = new URL('/v1/tools/call', BASE).toString();
	const res = await fetch(url, { method: 'POST', headers: makeHeaders(), body: JSON.stringify({ name, arguments: args }) });
	const json = await res.json().catch(async () => ({ ok: false, error: { message: await res.text() } }));
	if (!json.ok) {
		const msg = json?.error?.message ? String(json.error.message) : JSON.stringify(json);
		throw new Error(`Tool failed: ${name}: ${msg}`);
	}
	return json.data;
}

function pickTypeHint(v) {
	if (!v || typeof v !== 'object') return typeof v;
	if (typeof v.primitiveType === 'string' || typeof v.primitiveType === 'number') return `primitiveType(${String(v.primitiveType)})`;
	if (typeof v.PrimitiveType === 'string' || typeof v.PrimitiveType === 'number') return `PrimitiveType(${String(v.PrimitiveType)})`;
	if (typeof v.$type === 'string') return v.$type;
	const ctor = v.constructor?.name;
	return ctor ? `Object(${ctor})` : 'Object';
}

function fmtNum(n) {
	if (!Number.isFinite(n)) return String(n);
	const i = Math.round(n);
	if (Math.abs(n - i) < 1e-9) return String(i);
	return String(Number(n.toFixed(3)));
}

function fmtXY(x, y) {
	return `(${fmtNum(x)},${fmtNum(y)})`;
}

function wirePointCount(line) {
	if (!Array.isArray(line)) return 0;
	if (line.length === 0) return 0;
	if (typeof line[0] === 'number') return Math.floor(line.length / 2);
	return line.reduce((sum, seg) => sum + (Array.isArray(seg) ? Math.floor(seg.length / 2) : 0), 0);
}

function listPreview(items, max = 30) {
	if (items.length <= max) return { items, truncated: false, omitted: 0 };
	return { items: items.slice(0, max), truncated: true, omitted: items.length - max };
}

function normalizePrimitiveId(v) {
	if (v === undefined || v === null) return undefined;
	if (typeof v === 'string') {
		const s = v.trim();
		return s ? s : undefined;
	}
	if (typeof v === 'number') return Number.isFinite(v) ? String(v) : undefined;
	if (typeof v === 'bigint') return String(v);
	if (typeof v === 'object') {
		// Be defensive: some EDA APIs return objects like { primitiveId }.
		const o = v;
		const candidate = o?.primitiveId ?? o?.PrimitiveId ?? o?.id ?? o?.Id;
		if (candidate !== undefined && candidate !== null) return String(candidate);
	}
	return undefined;
}

function normalizePrimitiveIdList(arr) {
	const ids = [];
	let invalid = 0;
	for (const v of arr) {
		const id = normalizePrimitiveId(v);
		if (!id) invalid += 1;
		else ids.push(id);
	}
	return { ids, invalid };
}

function escapeOneLine(s) {
	return String(s ?? '')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t');
}

function summarizeUnknownPrimitive(obj) {
	if (!obj || typeof obj !== 'object') return '';

	const parts = [];

	const pt = obj.primitiveType ?? obj.PrimitiveType;
	if (pt !== undefined && pt !== null && pt !== '') parts.push(`primitiveType=${String(pt)}`);

	if (typeof obj.x === 'number' && typeof obj.y === 'number') {
		parts.push(`@${fmtXY(obj.x, obj.y)}`);
	} else if (typeof obj.centerX === 'number' && typeof obj.centerY === 'number') {
		parts.push(`center=${fmtXY(obj.centerX, obj.centerY)}`);
	} else if (typeof obj.topLeftX === 'number' && typeof obj.topLeftY === 'number') {
		if (typeof obj.width === 'number' && typeof obj.height === 'number') {
			parts.push(`rect=(${fmtNum(obj.topLeftX)},${fmtNum(obj.topLeftY)},w=${fmtNum(obj.width)},h=${fmtNum(obj.height)})`);
		} else {
			parts.push(`topLeft=${fmtXY(obj.topLeftX, obj.topLeftY)}`);
		}
	}

	if (typeof obj.rotation === 'number') parts.push(`rot=${fmtNum(obj.rotation)}`);
	if (obj.net != null && String(obj.net)) parts.push(`net=${String(obj.net)}`);
	if (obj.color != null && String(obj.color)) parts.push(`color=${String(obj.color)}`);
	if (obj.fillColor != null && String(obj.fillColor)) parts.push(`fill=${String(obj.fillColor)}`);
	if (obj.lineWidth != null && Number.isFinite(Number(obj.lineWidth))) parts.push(`lw=${fmtNum(Number(obj.lineWidth))}`);
	if (obj.lineType != null && String(obj.lineType)) parts.push(`lt=${String(obj.lineType)}`);

	if (obj.line && (Array.isArray(obj.line) || Array.isArray(obj.line?.[0]))) {
		parts.push(`points=${wirePointCount(obj.line)}`);
	}

	const keys = Object.keys(obj);
	if (keys.length) {
		const head = keys.slice(0, 12);
		parts.push(`keys=${head.join(',')}${keys.length > head.length ? `,+${keys.length - head.length}` : ''}`);
	}

	return parts.join(' ');
}

async function main() {
	const status = await httpGetJson('/v1/status');
	if (!status?.bridge?.connected) {
		console.log(
			[
				'Bridge not connected.',
				'- Ensure JLCEDA Pro is running and the extension "JLCEDA MCP Bridge" is enabled.',
				`- Ensure extension is configured to connect to ws://127.0.0.1:${status?.bridge?.listenPort ?? 9050}`,
				'- Then retry.',
			].join('\n'),
		);
		process.exitCode = 2;
		return;
	}

	const doc = await toolCall('jlc.document.current', {});
	if (!doc || doc.documentType !== 1) {
		console.log(
			[
				'Not in schematic page.',
				`doc=${JSON.stringify(doc)}`,
				'- Switch to a schematic page, or call jlc.schematic.ensure_page, then retry.',
			].join('\n'),
		);
		process.exitCode = 2;
		return;
	}

	const sel = await toolCall('jlc.eda.invoke', { path: 'sch_SelectControl.getAllSelectedPrimitives_PrimitiveId' });
	const { ids: selectedIds, invalid: invalidSelected } = Array.isArray(sel?.result)
		? normalizePrimitiveIdList(sel.result)
		: { ids: [], invalid: 0 };

	if (!selectedIds.length) {
		console.log('No primitives selected.');
		return;
	}

	if (invalidSelected) {
		console.log(`Note: ${invalidSelected} selected items had no primitiveId and were ignored.`);
	}

	let bbox;
	try {
		const bboxRes = await toolCall('jlc.eda.invoke', { path: 'sch_Primitive.getPrimitivesBBox', args: [selectedIds] });
		bbox = bboxRes?.result;
	} catch {
		bbox = undefined;
	}

	const [components, wires, texts] = await Promise.all([
		toolCall('jlc.schematic.list_components', { allSchematicPages: false }),
		toolCall('jlc.schematic.list_wires', {}),
		toolCall('jlc.schematic.list_texts', {}),
	]);

	const selSet = new Set(selectedIds);

	const selComponents = (components?.items ?? []).filter((c) => selSet.has(String(c.primitiveId)));
	const selWires = (wires?.items ?? []).filter((w) => selSet.has(String(w.primitiveId)));
	const selTexts = (texts?.items ?? []).filter((t) => selSet.has(String(t.primitiveId)));

	const known = new Set([...selComponents, ...selWires, ...selTexts].map((x) => String(x.primitiveId)));
	let unknownIds = selectedIds.filter((id) => !known.has(id));

	let selectedPins = [];
	let pinById = new Map();
	if (INCLUDE_PINS && selComponents.length && unknownIds.length) {
		for (const c of selComponents) {
			const compPid = String(c.primitiveId);
			try {
				const res = await toolCall('jlc.schematic.get_component_pins', { primitiveId: compPid });
				const pins = Array.isArray(res?.pins) ? res.pins : [];
				for (const p of pins) {
					const pinId = String(p?.primitiveId ?? '');
					if (!pinId) continue;
					pinById.set(pinId, {
						primitiveId: pinId,
						componentPrimitiveId: compPid,
						componentType: c.componentType ? String(c.componentType) : undefined,
						designator: c.designator != null ? String(c.designator) : undefined,
						name: c.name != null ? String(c.name) : undefined,
						pinNumber: p?.pinNumber != null ? String(p.pinNumber) : undefined,
						pinName: p?.pinName != null ? String(p.pinName) : undefined,
						x: Number(p?.x),
						y: Number(p?.y),
						rotation: Number(p?.rotation ?? 0),
						pinLength: Number(p?.pinLength ?? 0),
					});
				}
			} catch {
				// Non-part primitives (netflags/netports/etc) may not have pins; ignore.
			}
		}

		if (pinById.size) {
			selectedPins = unknownIds.filter((id) => pinById.has(id)).map((id) => pinById.get(id));
			const selectedPinIdSet = new Set(selectedPins.map((p) => p.primitiveId));
			unknownIds = unknownIds.filter((id) => !selectedPinIdSet.has(id));
		}
	}

	console.log(`Selected primitives: ${selectedIds.length}`);
	if (bbox && typeof bbox === 'object') {
		const { minX, minY, maxX, maxY } = bbox;
		if ([minX, minY, maxX, maxY].every((v) => typeof v === 'number')) {
			console.log(`BBox: min${fmtXY(minX, minY)} max${fmtXY(maxX, maxY)}`);
		}
	}

	if (selComponents.length) {
		console.log('');
		console.log(`Components: ${selComponents.length}`);
		const { items, truncated, omitted } = listPreview(selComponents, MAX_ITEMS);
		for (const c of items) {
			const pid = String(c.primitiveId);
			const type = c.componentType ? String(c.componentType) : 'component';
			const ref = c.designator ? String(c.designator) : '';
			const name = c.name != null ? String(c.name) : '';
			const net = c.net ? ` net=${String(c.net)}` : '';
			const device = FULL && c.component?.uuid ? ` deviceUuid=${String(c.component.uuid)}` : '';
			const lib = FULL && c.component?.libraryUuid ? ` libraryUuid=${String(c.component.libraryUuid)}` : '';
			const footprint = FULL && c.footprint?.uuid ? ` footprintUuid=${String(c.footprint.uuid)}` : '';
			console.log(
				`- ${pid} ${type}${ref ? ` ${ref}` : ''}${name ? ` (${name})` : ''}${net} @${fmtXY(Number(c.x), Number(c.y))} rot=${fmtNum(Number(c.rotation ?? 0))} mirror=${Boolean(c.mirror)}${device}${lib}${footprint}`,
			);
		}
		if (truncated) console.log(`- ... (${omitted} more)`);
	}

	if (selWires.length) {
		console.log('');
		console.log(`Wires: ${selWires.length}`);
		const { items, truncated, omitted } = listPreview(selWires, MAX_ITEMS);
		for (const w of items) {
			const pid = String(w.primitiveId);
			const net = w.net ? String(w.net) : '';
			const points = wirePointCount(w.line);
			const line = FULL ? ` line=${escapeOneLine(JSON.stringify(w.line))}` : '';
			console.log(`- ${pid}${net ? ` net=${net}` : ''} points=${points}${line}`);
		}
		if (truncated) console.log(`- ... (${omitted} more)`);
	}

	if (selTexts.length) {
		console.log('');
		console.log(`Texts: ${selTexts.length}`);
		const { items, truncated, omitted } = listPreview(selTexts, MAX_ITEMS);
		for (const t of items) {
			const pid = String(t.primitiveId);
			const raw = String(t.content ?? '');
			const content = FULL ? escapeOneLine(raw) : escapeOneLine(raw.replace(/\s+/g, ' ').trim());
			const display = FULL ? content : `${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`;
			console.log(
				`- ${pid} \"${display}\" @${fmtXY(Number(t.x), Number(t.y))} rot=${fmtNum(Number(t.rotation ?? 0))}${FULL ? ` font=${String(t.fontName ?? '')} size=${String(t.fontSize ?? '')}` : ''}`,
			);
		}
		if (truncated) console.log(`- ... (${omitted} more)`);
	}

	if (selectedPins.length) {
		console.log('');
		console.log(`Pins (selected): ${selectedPins.length}`);
		const { items, truncated, omitted } = listPreview(selectedPins, MAX_ITEMS);
		for (const p of items) {
			const comp = p.designator ? String(p.designator) : p.componentPrimitiveId ? `comp#${String(p.componentPrimitiveId)}` : 'comp';
			const num = p.pinNumber ? String(p.pinNumber) : '';
			const name = p.pinName ? String(p.pinName) : '';
			console.log(
				`- ${String(p.primitiveId)} ${comp}${num ? ` pin=${num}` : ''}${name ? ` (${name})` : ''} @${fmtXY(Number(p.x), Number(p.y))} rot=${fmtNum(Number(p.rotation ?? 0))} len=${fmtNum(Number(p.pinLength ?? 0))}`,
			);
		}
		if (truncated) console.log(`- ... (${omitted} more)`);
	}

	if (unknownIds.length) {
		console.log('');
		console.log(`Unknown primitives (not in list_components/list_wires/list_texts/pins): ${unknownIds.length}`);

		if (PROBE_UNKNOWN) {
			const sample = PROBE_ALL ? unknownIds : unknownIds.slice(0, PROBE_LIMIT);
			const counts = new Map();
			const perId = [];
			for (const id of sample) {
				try {
					const res = await toolCall('jlc.eda.invoke', {
						path: 'sch_Primitive.getPrimitiveByPrimitiveId',
						args: [id],
						jsonSafe: { maxDepth: FULL ? 4 : 2, maxArrayLength: 50, maxObjectKeys: 200, maxStringLength: 4000 },
						timeoutMs: 10_000,
					});
					const hint = pickTypeHint(res?.result);
					const summary = summarizeUnknownPrimitive(res?.result);
					counts.set(hint, (counts.get(hint) ?? 0) + 1);
					perId.push({ id, hint, summary });
				} catch {
					counts.set('probe_failed', (counts.get('probe_failed') ?? 0) + 1);
					perId.push({ id, hint: 'probe_failed', summary: '' });
				}
			}

			const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
			console.log(`Type hints (probed ${sample.length}/${unknownIds.length}):`);
			for (const [k, v] of sorted) console.log(`- ${k}: ${v}`);

			if (perId.length) {
				console.log(PROBE_ALL ? 'Unknown details:' : 'Unknown details (sample):');
				for (const it of perId) console.log(`- ${it.id} type=${it.hint}${it.summary ? ` ${it.summary}` : ''}`);
				if (!PROBE_ALL && unknownIds.length > sample.length) {
					console.log(`- ... (${unknownIds.length - sample.length} more; use --probe-all or --full to describe all)`);
				}
			}
			if (PROBE_ALL) return;
		}

		const { items, truncated, omitted } = listPreview(unknownIds, MAX_UNKNOWN_IDS);
		for (const id of items) console.log(`- ${id}`);
		if (truncated) console.log(`- ... (${omitted} more)`);
	}
}

await main();

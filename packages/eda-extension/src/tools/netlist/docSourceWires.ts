export type WireSeg = { x1: number; y1: number; x2: number; y2: number };

export type ParsedWire = { wireId: string; net?: string; segments: Array<WireSeg> };

export function pointKey(x: number, y: number): string {
	return `${Math.round(x)},${Math.round(y)}`;
}

function parseLine(raw: string): { head: any; body: any } | undefined {
	const line = raw.trim();
	if (!line) return undefined;

	const sep = line.indexOf('||');
	if (sep === -1) return undefined;

	const headStr = line.slice(0, sep);
	let bodyStr = line.slice(sep + 2);
	if (bodyStr.endsWith('|')) bodyStr = bodyStr.slice(0, -1);

	try {
		return { head: JSON.parse(headStr), body: JSON.parse(bodyStr) };
	} catch {
		return undefined;
	}
}

export function parseWiresFromDocumentSource(
	source: string,
	opts?: { wireIds?: Set<string>; netNames?: Set<string> },
): Map<string, ParsedWire> {
	const wires = new Map<string, ParsedWire>();

	const ensureWire = (wireId: string): ParsedWire => {
		let w = wires.get(wireId);
		if (!w) {
			w = { wireId, net: undefined, segments: [] };
			wires.set(wireId, w);
		}
		return w;
	};

	const lines = source.split(/\r?\n/);
	for (const raw of lines) {
		const parsed = parseLine(raw);
		if (!parsed) continue;
		const type = String(parsed.head?.type ?? '');

		if (type === 'WIRE') {
			const id = String(parsed.head?.id ?? '');
			if (!id) continue;
			if (opts?.wireIds && !opts.wireIds.has(id)) continue;
			ensureWire(id);
			continue;
		}

		if (type === 'LINE') {
			const group = parsed.body?.lineGroup != null ? String(parsed.body.lineGroup) : '';
			if (!group) continue;
			if (opts?.wireIds && !opts.wireIds.has(group)) continue;
			const x1 = Number(parsed.body?.startX);
			const y1 = Number(parsed.body?.startY);
			const x2 = Number(parsed.body?.endX);
			const y2 = Number(parsed.body?.endY);
			if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) continue;
			ensureWire(group).segments.push({ x1, y1, x2, y2 });
			continue;
		}

		if (type === 'ATTR') {
			const parentId = parsed.body?.parentId != null ? String(parsed.body.parentId) : '';
			if (!parentId) continue;
			if (opts?.wireIds && !opts.wireIds.has(parentId)) continue;
			const key = parsed.body?.key != null ? String(parsed.body.key) : '';
			if (key !== 'NET') continue;
			const value = parsed.body?.value != null ? String(parsed.body.value) : '';
			if (!value) continue;
			if (opts?.netNames && !opts.netNames.has(value)) continue;
			ensureWire(parentId).net = value;
			continue;
		}
	}

	// If filtering by netNames without wireIds, drop any wire without net match.
	if (opts?.netNames && !opts?.wireIds) {
		for (const [id, w] of wires.entries()) {
			if (!w.net || !opts.netNames.has(w.net)) wires.delete(id);
		}
	}

	return wires;
}

export function buildAdjacency(segments: Array<WireSeg>): Map<string, Set<string>> {
	const adj = new Map<string, Set<string>>();
	const addEdge = (a: string, b: string): void => {
		let s = adj.get(a);
		if (!s) {
			s = new Set<string>();
			adj.set(a, s);
		}
		s.add(b);
	};

	for (const seg of segments) {
		const a = pointKey(seg.x1, seg.y1);
		const b = pointKey(seg.x2, seg.y2);
		addEdge(a, b);
		addEdge(b, a);
	}

	return adj;
}

export function bfsReachable(adj: Map<string, Set<string>>, start: string): Set<string> {
	const visited = new Set<string>();
	const queue: Array<string> = [start];
	visited.add(start);

	while (queue.length) {
		const cur = queue.shift()!;
		const next = adj.get(cur);
		if (!next) continue;
		for (const n of next) {
			if (visited.has(n)) continue;
			visited.add(n);
			queue.push(n);
		}
	}

	return visited;
}


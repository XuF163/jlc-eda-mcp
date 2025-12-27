export type NetlistEndpoint = { ref: string; pin: string };

export type ParsedNetlist = {
	ok: boolean;
	formatGuess?: string;
	warnings: Array<string>;
	nets: Record<string, Array<NetlistEndpoint>>;
};

function normalizeNetName(name: string): string {
	return String(name).trim().replace(/^"(.*)"$/, '$1').toUpperCase();
}

function normalizeRef(ref: string): string {
	return String(ref).trim().toUpperCase();
}

function normalizePin(pin: string): string {
	return String(pin).trim().toUpperCase();
}

function looksLikeRef(token: string): boolean {
	return /^[A-Z]{1,6}\d+[A-Z]?$/.test(token.toUpperCase());
}

function stripPunct(token: string): string {
	return token.replace(/^[\s,;()]+|[\s,;()]+$/g, '');
}

function extractRefPinInlineTokens(line: string): Array<NetlistEndpoint> {
	const endpoints: Array<NetlistEndpoint> = [];

	// Common inline formats: R1-2, U3.5, J1:1
	const tokens = line
		.replace(/[,\t]/g, ' ')
		.split(/\s+/)
		.map(stripPunct)
		.filter(Boolean);

	for (const t of tokens) {
		const m = /^([A-Za-z]{1,6}\d+[A-Za-z]?)[-.:]([A-Za-z0-9_]+)$/.exec(t);
		if (!m) continue;
		endpoints.push({ ref: normalizeRef(m[1]), pin: normalizePin(m[2]) });
	}

	return endpoints;
}

function extractRefPinPair(line: string): NetlistEndpoint | undefined {
	// Common two-token formats: "*PIN* R1 2" or "R1 2"
	const tokens = line
		.replace(/[,\t]/g, ' ')
		.split(/\s+/)
		.map(stripPunct)
		.filter(Boolean);

	const tryPair = (refToken: string | undefined, pinToken: string | undefined): NetlistEndpoint | undefined => {
		if (!refToken || !pinToken) return undefined;
		const ref = normalizeRef(refToken);
		const pin = normalizePin(pinToken);
		if (!looksLikeRef(ref)) return undefined;
		if (!pin) return undefined;
		return { ref, pin };
	};

	if (tokens[0]?.toUpperCase() === '*PIN*') return tryPair(tokens[1], tokens[2]);
	if (tokens.length === 2) return tryPair(tokens[0], tokens[1]);
	return undefined;
}

function parseKiCadSexprNetStart(line: string): string | undefined {
	// Example: (net (code 1) (name "GND"))
	const m = /^\s*\(net\b.*?\(name\s+("?)([^")]+)\1\)\s*\)?\s*$/i.exec(line);
	if (!m) return undefined;
	return m[2];
}

function parseKiCadSexprNode(line: string): NetlistEndpoint | undefined {
	// Example: (node (ref R1) (pin 2))
	const refM = /\(ref\s+("?)([^")\s]+)\1\)/i.exec(line);
	const pinM = /\(pin\s+("?)([^")\s]+)\1\)/i.exec(line);
	if (!refM || !pinM) return undefined;
	return { ref: normalizeRef(refM[2]), pin: normalizePin(pinM[2]) };
}

export function parseNetlist(text: string): ParsedNetlist {
	const warnings: Array<string> = [];
	const netsByKey = new Map<string, { name: string; endpoints: Map<string, NetlistEndpoint> }>();
	const ensureNet = (name: string): { name: string; endpoints: Map<string, NetlistEndpoint> } => {
		const key = normalizeNetName(name);
		let entry = netsByKey.get(key);
		if (!entry) {
			entry = { name: String(name).trim(), endpoints: new Map<string, NetlistEndpoint>() };
			netsByKey.set(key, entry);
		}
		return entry;
	};

	const lines = String(text ?? '').split(/\r?\n/);
	let currentNet: string | undefined;

	// Format hints
	const joined = lines.slice(0, 200).join('\n');
	const isKiCadSexpr = joined.includes('(net') && joined.includes('(node');
	const isPads = joined.includes('*PADS-PCB*') || joined.toUpperCase().includes('*NET*');
	const isAllegro = joined.toUpperCase().includes('$NETS');

	const formatGuess = isKiCadSexpr ? 'kicad-sexp' : isPads ? 'pads' : isAllegro ? 'allegro' : undefined;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;

		// KiCad S-expression
		if (isKiCadSexpr) {
			const netName = parseKiCadSexprNetStart(line);
			if (netName) {
				currentNet = netName;
				ensureNet(netName);
				continue;
			}
			if (currentNet) {
				const node = parseKiCadSexprNode(line);
				if (node) {
					const net = ensureNet(currentNet);
					net.endpoints.set(`${node.ref}.${node.pin}`, node);
				}
			}
			continue;
		}

		// PADS / generic net-block
		const padsNet = /^\s*\*NET\*\s+(.+?)\s*$/i.exec(line);
		if (padsNet) {
			currentNet = padsNet[1];
			ensureNet(currentNet);
			continue;
		}

		const allegroNet = /^\s*\$NET\s+(.+?)\s*$/i.exec(line);
		if (allegroNet) {
			currentNet = allegroNet[1];
			ensureNet(currentNet);
			continue;
		}

		// Some formats use "NET <name>"
		const plainNet = /^\s*NET\s+("?)([^"]+)\1\s*$/i.exec(line);
		if (plainNet) {
			currentNet = plainNet[2];
			ensureNet(currentNet);
			continue;
		}

		// End markers
		if (/^\s*\*END\*\s*$/i.test(line) || /^\s*\$ENDNETS\b/i.test(line)) {
			currentNet = undefined;
			continue;
		}

		if (!currentNet) continue;

		const net = ensureNet(currentNet);

		const pair = extractRefPinPair(line);
		if (pair) {
			net.endpoints.set(`${pair.ref}.${pair.pin}`, pair);
			continue;
		}

		for (const ep of extractRefPinInlineTokens(line)) {
			net.endpoints.set(`${ep.ref}.${ep.pin}`, ep);
		}
	}

	const nets: Record<string, Array<NetlistEndpoint>> = {};
	let endpointCount = 0;
	for (const entry of netsByKey.values()) {
		const list = Array.from(entry.endpoints.values());
		nets[normalizeNetName(entry.name)] = list;
		endpointCount += list.length;
	}

	if (Object.keys(nets).length === 0) warnings.push('No nets parsed from netlist text.');
	if (Object.keys(nets).length > 0 && endpointCount === 0) warnings.push('Nets were detected but no endpoints (Ref.Pin) could be parsed.');

	return { ok: warnings.length === 0, formatGuess, warnings, nets };
}


import { asObject, asOptionalNumber, asString, rpcError } from '../bridge/validate';

/**
 * Dynamic access to the full JLCEDA Pro extension API surface (`globalThis.eda`).
 *
 * Why this exists:
 * - The SDK exposes hundreds of APIs (see `@jlceda/pro-api-types`), but this bridge previously hard-coded a small whitelist.
 * - For power users, it is useful to expose "everything" through MCP without writing bespoke wrappers for each method.
 *
 * Important:
 * - This is effectively a remote "reflection" / "invoke by string" capability.
 * - Only JSON-serializable values can cross the bridge. For safety and stability, we convert results to JSON-safe shapes
 *   (cycle-safe + depth/size limits). You can tune the limits per call via `jsonSafe`.
 * - Callbacks/functions cannot be sent over the bridge; APIs that require function arguments (e.g. event listeners) will not work.
 */

type JsonSafeOptions = {
	/** Max recursion depth when converting results to JSON-safe structures. */
	maxDepth?: number;
	/** Max number of array elements to include (rest will be truncated). */
	maxArrayLength?: number;
	/** Max number of object keys to include (rest will be truncated). */
	maxObjectKeys?: number;
	/** Max string length to include (rest will be truncated). */
	maxStringLength?: number;
};

const DEFAULT_JSON_SAFE: Required<JsonSafeOptions> = {
	maxDepth: 6,
	maxArrayLength: 200,
	maxObjectKeys: 200,
	maxStringLength: 20_000,
};

// Prevent prototype-pollution style traversal and other surprising reflective access.
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function parseJsonSafeOptions(input: Record<string, unknown>): Required<JsonSafeOptions> {
	const raw = input.jsonSafe;
	if (!raw) return DEFAULT_JSON_SAFE;
	if (typeof raw !== 'object' || Array.isArray(raw)) throw rpcError('INVALID_PARAMS', 'Expected jsonSafe to be an object');
	const o = raw as Record<string, unknown>;

	const maxDepth = asOptionalNumber(o.maxDepth, 'jsonSafe.maxDepth') ?? DEFAULT_JSON_SAFE.maxDepth;
	const maxArrayLength = asOptionalNumber(o.maxArrayLength, 'jsonSafe.maxArrayLength') ?? DEFAULT_JSON_SAFE.maxArrayLength;
	const maxObjectKeys = asOptionalNumber(o.maxObjectKeys, 'jsonSafe.maxObjectKeys') ?? DEFAULT_JSON_SAFE.maxObjectKeys;
	const maxStringLength = asOptionalNumber(o.maxStringLength, 'jsonSafe.maxStringLength') ?? DEFAULT_JSON_SAFE.maxStringLength;

	return {
		maxDepth: Math.max(1, Math.floor(maxDepth)),
		maxArrayLength: Math.max(1, Math.floor(maxArrayLength)),
		maxObjectKeys: Math.max(1, Math.floor(maxObjectKeys)),
		maxStringLength: Math.max(1, Math.floor(maxStringLength)),
	};
}

function toJsonSafe(
	value: unknown,
	opts: Required<JsonSafeOptions>,
	depth: number,
	seen: WeakSet<object>,
): unknown {
	// Primitive fast paths
	if (value === null) return null;
	if (value === undefined) return null; // JSON has no undefined; normalize to null.
	if (typeof value === 'boolean' || typeof value === 'number') return value;
	if (typeof value === 'bigint') return { $type: 'BigInt', value: String(value) };
	if (typeof value === 'string') {
		if (value.length <= opts.maxStringLength) return value;
		return value.slice(0, opts.maxStringLength) + `… (truncated, totalChars=${value.length})`;
	}
	if (typeof value === 'symbol') return { $type: 'Symbol', value: String(value) };
	if (typeof value === 'function') return { $type: 'Function', name: (value as Function).name || 'anonymous' };

	// Depth limit
	if (depth >= opts.maxDepth) {
		const name = (value as any)?.constructor?.name;
		return { $type: 'Truncated', depth: opts.maxDepth, hint: name ? `Object(${name})` : 'Object' };
	}

	// Objects / arrays
	if (typeof value !== 'object') return String(value);
	const obj = value as any;
	if (seen.has(obj)) return { $type: 'Circular' };
	seen.add(obj);

	// Errors have useful fields that are non-enumerable; normalize them.
	if (obj instanceof Error) {
		return {
			$type: 'Error',
			name: obj.name,
			message: obj.message,
			stack: typeof obj.stack === 'string' ? obj.stack : undefined,
		};
	}

	// Dates are common in APIs; serialize as ISO.
	if (obj instanceof Date) {
		return { $type: 'Date', value: obj.toISOString() };
	}

	// Typed arrays / ArrayBuffer: return a lightweight summary (avoid huge payloads).
	if (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) {
		return { $type: 'ArrayBuffer', byteLength: obj.byteLength };
	}
	if (typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) {
		const preview = Array.from(obj.slice(0, Math.min(obj.length, 64)));
		return { $type: 'Uint8Array', length: obj.length, preview };
	}

	if (Array.isArray(obj)) {
		const max = opts.maxArrayLength;
		const items = obj.slice(0, max).map((v) => toJsonSafe(v, opts, depth + 1, seen));
		if (obj.length > max) items.push({ $type: 'TruncatedItems', omitted: obj.length - max });
		return items;
	}

	// Plain objects (and most API results) - enumerate keys, with limits.
	const out: Record<string, unknown> = {};
	const keys = Object.keys(obj);
	const maxKeys = opts.maxObjectKeys;
	for (const k of keys.slice(0, maxKeys)) {
		if (FORBIDDEN_PATH_SEGMENTS.has(k)) continue;
		try {
			out[k] = toJsonSafe(obj[k], opts, depth + 1, seen);
		} catch (err) {
			out[k] = { $type: 'Unserializable', error: err instanceof Error ? err.message : String(err) };
		}
	}
	if (keys.length > maxKeys) out.$truncatedKeys = { omitted: keys.length - maxKeys };

	// If nothing is enumerable, keep at least some hint.
	if (keys.length === 0) {
		const name = obj?.constructor?.name;
		out.$type = name ? `Object(${name})` : 'Object';
	}
	return out;
}

function parsePath(pathRaw: string): Array<string> {
	const path = pathRaw.trim();
	if (!path) throw rpcError('INVALID_PARAMS', 'path is required');

	// Allow both "sch_Document.save" and "eda.sch_Document.save".
	const normalized = path === 'eda' ? '' : path.startsWith('eda.') ? path.slice('eda.'.length) : path;
	if (!normalized) return [];

	const segments = normalized.split('.').map((s) => s.trim()).filter(Boolean);
	if (!segments.length) return [];

	for (const seg of segments) {
		if (FORBIDDEN_PATH_SEGMENTS.has(seg)) throw rpcError('INVALID_PARAMS', `Forbidden path segment: ${seg}`);
		// Keep it strict: only identifiers (no bracket access).
		if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(seg)) throw rpcError('INVALID_PARAMS', `Invalid path segment: ${seg}`);
	}
	return segments;
}

function resolveContainerAndKey(root: any, segments: Array<string>): { container: any; key?: string } {
	let cur = root;
	for (const seg of segments.slice(0, Math.max(0, segments.length - 1))) {
		if (cur == null) throw rpcError('NOT_FOUND', `Path not found (at ${seg})`);
		cur = cur[seg];
	}
	if (!segments.length) return { container: cur, key: undefined };
	return { container: cur, key: segments[segments.length - 1] };
}

export async function edaInvoke(params: unknown): Promise<unknown> {
	const input = params ? asObject(params, 'params') : {};
	const path = asString(input.path, 'path');
	const opts = parseJsonSafeOptions(input);

	// Support both positional args (`args`) and a single convenience arg (`arg`).
	let args: Array<unknown> = [];
	if ('args' in input && input.args !== undefined) {
		if (!Array.isArray(input.args)) throw rpcError('INVALID_PARAMS', 'Expected args to be an array');
		args = input.args;
	} else if ('arg' in input && (input as any).arg !== undefined) {
		args = [(input as any).arg];
	}

	const segments = parsePath(path);
	const { container, key } = resolveContainerAndKey(eda as any, segments);
	if (!key) throw rpcError('INVALID_PARAMS', 'path must point to a function (e.g. "sch_Document.save")');

	const fn = container?.[key];
	if (typeof fn !== 'function') throw rpcError('INVALID_PARAMS', `Target is not a function: ${path}`);

	const result = await fn.apply(container, args);
	return {
		ok: true,
		path,
		argsCount: args.length,
		result: toJsonSafe(result, opts, 0, new WeakSet()),
	};
}

export async function edaGet(params: unknown): Promise<unknown> {
	const input = params ? asObject(params, 'params') : {};
	const path = asString(input.path, 'path');
	const opts = parseJsonSafeOptions(input);

	const segments = parsePath(path);
	let cur: any = eda as any;
	for (const seg of segments) {
		if (cur == null) throw rpcError('NOT_FOUND', `Path not found (at ${seg})`);
		cur = cur[seg];
	}

	return { ok: true, path, value: toJsonSafe(cur, opts, 0, new WeakSet()) };
}

export async function edaKeys(params: unknown): Promise<unknown> {
	const input = params ? asObject(params, 'params') : {};
	const path = typeof input.path === 'string' ? input.path : 'eda';
	const opts = parseJsonSafeOptions(input);

	const segments = parsePath(path);
	let cur: any = eda as any;
	for (const seg of segments) {
		if (cur == null) throw rpcError('NOT_FOUND', `Path not found (at ${seg})`);
		cur = cur[seg];
	}

	// Use `getOwnPropertyNames` to reveal more than enumerable keys when possible.
	const names = Array.from(new Set([...Object.keys(cur ?? {}), ...Object.getOwnPropertyNames(cur ?? {})]))
		.filter((k) => !FORBIDDEN_PATH_SEGMENTS.has(k))
		.sort();

	return { ok: true, path, keys: toJsonSafe(names, opts, 0, new WeakSet()) };
}


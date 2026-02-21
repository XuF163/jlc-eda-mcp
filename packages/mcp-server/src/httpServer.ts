import * as http from 'node:http';
import { z } from 'zod';

import type { WsBridge } from './bridge/wsBridge.js';
import { createToolRegistry } from './tools/toolRegistry.js';

const MAX_BODY_BYTES = 2_000_000;

const RpcCallSchema = z.object({
	method: z.string().min(1),
	params: z.unknown().optional(),
	timeoutMs: z.number().int().positive().max(300_000).optional(),
});

const ToolCallSchema = z.object({
	name: z.string().min(1),
	arguments: z.unknown().optional(),
});

function getHeader(req: http.IncomingMessage, name: string): string | undefined {
	const v = req.headers[name.toLowerCase()];
	if (typeof v === 'string') return v;
	if (Array.isArray(v)) return v[0];
	return undefined;
}

function getBearerToken(req: http.IncomingMessage): string | undefined {
	const auth = getHeader(req, 'authorization');
	if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice('bearer '.length).trim();
	return getHeader(req, 'x-jlceda-token')?.trim() || undefined;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
	const text = JSON.stringify(body, null, 2);
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(text);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
	const chunks: Array<Buffer> = [];
	let total = 0;

	for await (const chunk of req) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
		total += buf.length;
		if (total > MAX_BODY_BYTES) throw new Error(`Request body too large (>${MAX_BODY_BYTES} bytes)`);
		chunks.push(buf);
	}

	const raw = Buffer.concat(chunks).toString('utf8').trim();
	if (!raw) return {};
	return JSON.parse(raw);
}

function toErrorPayload(err: unknown): { message: string; code?: string; data?: unknown } {
	if (!(err instanceof Error)) return { message: String(err) };

	const payload: { message: string; code?: string; data?: unknown } = { message: err.message };
	const anyErr = err as any;
	if (typeof anyErr.code === 'string') payload.code = anyErr.code;
	if (anyErr.data !== undefined) payload.data = anyErr.data;
	return payload;
}

function tryParseJsonText(content: unknown): unknown {
	if (!Array.isArray(content) || content.length !== 1) return undefined;
	const first = content[0] as any;
	if (!first || first.type !== 'text' || typeof first.text !== 'string') return undefined;
	try {
		return JSON.parse(first.text);
	} catch {
		return first.text;
	}
}

export async function runHttpServer(opts: {
	bridge: WsBridge;
	port: number;
	token?: string;
	log?: (line: string) => void;
}): Promise<http.Server> {
	const tools = createToolRegistry(opts.bridge);
	const toolByName = new Map(tools.map((t) => [t.name, t] as const));

	const server = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
			const method = (req.method ?? 'GET').toUpperCase();

			if (opts.token) {
				const token = getBearerToken(req);
				if (!token || token !== opts.token) {
					sendJson(res, 401, { ok: false, error: { message: 'Unauthorized' } });
					return;
				}
			}

			if (method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
				sendJson(res, 200, { ok: true, name: 'jlceda-eda-mcp-http', bridge: opts.bridge.getStatus() });
				return;
			}

			if (method === 'GET' && url.pathname === '/v1/status') {
				sendJson(res, 200, { ok: true, bridge: opts.bridge.getStatus() });
				return;
			}

			if (method === 'GET' && url.pathname === '/v1/tools') {
				sendJson(res, 200, {
					ok: true,
					tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
				});
				return;
			}

			if (method === 'POST' && url.pathname === '/v1/tools/call') {
				const startedAt = Date.now();
				const body = await readJson(req);
				const parsed = ToolCallSchema.parse(body);

				const tool = toolByName.get(parsed.name);
				if (!tool) {
					sendJson(res, 404, { ok: false, error: { message: `Unknown tool: ${parsed.name}` } });
					return;
				}

				const toolResult = await tool.run(parsed.arguments ?? {});
				const data = tryParseJsonText((toolResult as any)?.content);

				sendJson(res, 200, {
					ok: true,
					name: parsed.name,
					elapsedMs: Date.now() - startedAt,
					data,
					toolResult,
				});
				return;
			}

			if (method === 'POST' && url.pathname === '/v1/rpc') {
				const startedAt = Date.now();
				const body = await readJson(req);
				const parsed = RpcCallSchema.parse(body);
				const timeoutMs = parsed.timeoutMs ?? 60_000;

				const result = await opts.bridge.call(parsed.method, parsed.params, timeoutMs);
				sendJson(res, 200, { ok: true, method: parsed.method, elapsedMs: Date.now() - startedAt, result });
				return;
			}

			sendJson(res, 404, { ok: false, error: { message: `Not found: ${method} ${url.pathname}` } });
		} catch (err) {
			opts.log?.(`[jlceda-eda-mcp] HTTP error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
			sendJson(res, 500, { ok: false, error: toErrorPayload(err) });
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen({ host: '127.0.0.1', port: opts.port }, () => resolve());
	});

	opts.log?.(`[jlceda-eda-mcp] HTTP listening on http://127.0.0.1:${opts.port}`);
	return server;
}

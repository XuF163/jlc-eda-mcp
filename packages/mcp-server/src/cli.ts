#!/usr/bin/env node
import process from 'node:process';

import { WsBridge } from './bridge/wsBridge.js';
import { runHttpServer } from './httpServer.js';
import { runMcpServer } from './mcpServer.js';
import { runSelfTest } from './selfTest.js';

function getArgValue(flag: string): string | undefined {
	const i = process.argv.indexOf(flag);
	if (i === -1) return undefined;
	return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

function parsePort(value: string | undefined): number {
	if (!value) return 9050;
	const n = Number(value);
	if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`Invalid port: ${value}`);
	return n;
}

function parseOptionalPort(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	return parsePort(value);
}

function parseTimeoutMs(value: string | undefined, defaultMs: number): number {
	if (!value) return defaultMs;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid timeoutMs: ${value}`);
	return Math.floor(n);
}

async function main(): Promise<void> {
	const port = parsePort(getArgValue('--port') ?? process.env.JLCEDA_MCP_PORT);

	const httpEnabled = hasFlag('--http') || getArgValue('--http-port') !== undefined || process.env.JLCEDA_HTTP_PORT !== undefined;
	const httpPort = httpEnabled
		? parsePort(getArgValue('--http-port') ?? process.env.JLCEDA_HTTP_PORT ?? '9151')
		: parseOptionalPort(process.env.JLCEDA_HTTP_PORT);
	const httpToken = getArgValue('--http-token') ?? process.env.JLCEDA_HTTP_TOKEN;
	const noMcp = hasFlag('--no-mcp') || (process.env.JLCEDA_NO_MCP ?? '') === '1';

	const selfTest = hasFlag('--self-test') || (process.env.JLCEDA_MCP_SELF_TEST ?? '') === '1';
	const selfTestTimeoutMs = parseTimeoutMs(getArgValue('--self-test-timeout-ms') ?? process.env.JLCEDA_MCP_SELF_TEST_TIMEOUT_MS, 60_000);

	process.stderr.write(`[jlceda-eda-mcp] WebSocket listening on ws://127.0.0.1:${port}\n`);

	const bridge = new WsBridge({
		port,
		log: (line) => process.stderr.write(`${line}\n`),
	});

	let httpServer: import('node:http').Server | undefined;
	if (!selfTest && httpPort !== undefined) {
		httpServer = await runHttpServer({
			bridge,
			port: httpPort,
			token: httpToken,
			log: (line) => process.stderr.write(`${line}\n`),
		});
	}

	const onSignal = () => {
		try {
			try {
				httpServer?.close();
			} catch {
				// ignore
			}
			bridge.close();
		} finally {
			process.exit(0);
		}
	};
	process.on('SIGINT', onSignal);
	process.on('SIGTERM', onSignal);

	if (selfTest) {
		process.stderr.write('[jlceda-eda-mcp] Self-test mode: waiting for EDA extension connection...\n');
		const result = await runSelfTest(bridge, { timeoutMs: selfTestTimeoutMs });
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		bridge.close();
		return;
	}

	if (noMcp) {
		if (!httpServer) throw new Error('HTTP is disabled: use --http/--http-port (or JLCEDA_HTTP_PORT) with --no-mcp');
		process.stderr.write('[jlceda-eda-mcp] MCP disabled (HTTP-only mode). Press Ctrl+C to stop.\n');
		// Keep process alive.
		await new Promise(() => {});
		return;
	}

	await runMcpServer({ bridge });
}

void main().catch((err: unknown) => {
	const msg = err instanceof Error ? err.stack ?? err.message : String(err);
	process.stderr.write(`[jlceda-eda-mcp] Fatal: ${msg}\n`);
	process.exit(1);
});

#!/usr/bin/env node
import process from 'node:process';

import { WsBridge } from './bridge/wsBridge.js';
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

function parseTimeoutMs(value: string | undefined, defaultMs: number): number {
	if (!value) return defaultMs;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid timeoutMs: ${value}`);
	return Math.floor(n);
}

async function main(): Promise<void> {
	const port = parsePort(getArgValue('--port') ?? process.env.JLCEDA_MCP_PORT);

	const selfTest = hasFlag('--self-test') || (process.env.JLCEDA_MCP_SELF_TEST ?? '') === '1';
	const selfTestTimeoutMs = parseTimeoutMs(getArgValue('--self-test-timeout-ms') ?? process.env.JLCEDA_MCP_SELF_TEST_TIMEOUT_MS, 60_000);

	process.stderr.write(`[jlceda-eda-mcp] WebSocket listening on ws://127.0.0.1:${port}\n`);

	const bridge = new WsBridge({
		port,
		log: (line) => process.stderr.write(`${line}\n`),
	});

	const onSignal = () => {
		try {
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

	await runMcpServer({ bridge });
}

void main().catch((err: unknown) => {
	const msg = err instanceof Error ? err.stack ?? err.message : String(err);
	process.stderr.write(`[jlceda-eda-mcp] Fatal: ${msg}\n`);
	process.exit(1);
});

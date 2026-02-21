import process from 'node:process';

import { WsBridge } from '../dist/bridge/wsBridge.js';

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function waitForConnected(bridge, timeoutMs) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (bridge.getStatus().connected) return;
		await sleep(200);
	}
	throw new Error(`Timed out waiting for EDA extension connection (${timeoutMs}ms)`);
}

function uniq(arr) {
	return Array.from(new Set(arr));
}

async function main() {
	const port = Number.parseInt(process.env.JLCEDA_MCP_PORT ?? '9050', 10);
	const timeoutMs = Number.parseInt(process.env.JLCEDA_MCP_TIMEOUT_MS ?? '180000', 10);

	process.stderr.write(`[read] WebSocket listening on ws://127.0.0.1:${port}\n`);
	const bridge = new WsBridge({
		port,
		log: (line) => process.stderr.write(`${line}\n`),
	});

	try {
		process.stderr.write('[read] Waiting for EDA extension connection...\n');
		await waitForConnected(bridge, timeoutMs);

		const doc = await bridge.call('getCurrentDocumentInfo', undefined, 10_000);
		if (!doc) {
			await bridge.call('showMessage', { message: 'MCP: No active document. Please open a schematic page.' }, 5_000).catch(() => {});
			console.log(JSON.stringify({ ok: false, error: 'NO_ACTIVE_DOCUMENT', doc }, null, 2));
			process.exitCode = 2;
			return;
		}

		if (Number(doc.documentType) !== 1) {
			await bridge
				.call('showMessage', { message: `MCP: Current docType=${doc.documentType}. Please switch to a schematic page.` }, 5_000)
				.catch(() => {});
			console.log(JSON.stringify({ ok: false, error: 'NOT_IN_SCHEMATIC_PAGE', doc }, null, 2));
			process.exitCode = 3;
			return;
		}

		const [components, wires, texts] = await Promise.all([
			bridge.call('schematic.listComponents', { allSchematicPages: false }, 120_000),
			bridge.call('schematic.listWires', {}, 120_000),
			bridge.call('schematic.listTexts', undefined, 120_000),
		]);

		const netCounts = new Map();
		for (const w of wires?.items ?? []) {
			const net = String(w?.net ?? '').trim();
			if (!net) continue;
			netCounts.set(net, (netCounts.get(net) ?? 0) + 1);
		}
		const topNets = Array.from(netCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 15)
			.map(([net, count]) => ({ net, wires: count }));

		const byDesignatorPrefix = new Map();
		for (const c of components?.items ?? []) {
			const d = String(c?.designator ?? '').trim();
			if (!d) continue;
			const m = d.match(/^([A-Za-z]+)/);
			const p = String(m?.[1] ?? '?').toUpperCase();
			byDesignatorPrefix.set(p, (byDesignatorPrefix.get(p) ?? 0) + 1);
		}
		const designators = Array.from(byDesignatorPrefix.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 30)
			.map(([prefix, count]) => ({ prefix, count }));

		const result = {
			ok: true,
			doc,
			summary: {
				componentsTotal: components?.total ?? 0,
				wiresTotal: wires?.total ?? 0,
				textsTotal: texts?.total ?? 0,
				uniqueNets: uniq((wires?.items ?? []).map((w) => String(w?.net ?? '').trim()).filter(Boolean)).length,
			},
			designators,
			topNets,
			sampleComponents: (components?.items ?? []).slice(0, 25).map((c) => ({
				designator: c?.designator,
				name: c?.name,
				componentType: c?.componentType,
				primitiveId: c?.primitiveId,
				x: c?.x,
				y: c?.y,
				net: c?.net,
			})),
		};

		try {
			await bridge.call(
				'showMessage',
				{ message: `MCP: Read schematic OK. comps=${result.summary.componentsTotal}, wires=${result.summary.wiresTotal}, nets=${result.summary.uniqueNets}` },
				5_000,
			);
		} catch {
			// ignore
		}

		console.log(JSON.stringify(result, null, 2));
	} finally {
		bridge.close();
	}
}

await main();


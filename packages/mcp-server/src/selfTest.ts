import type { WsBridge } from './bridge/wsBridge.js';

type StepResult =
	| { step: string; ok: true; result?: unknown }
	| { step: string; ok: false; error: { message: string; code?: unknown; data?: unknown } };

function serializeError(err: unknown): { message: string; code?: unknown; data?: unknown } {
	if (err instanceof Error) {
		const anyErr = err as any;
		return { message: err.message, code: anyErr?.code, data: anyErr?.data };
	}
	return { message: String(err) };
}

async function waitForConnected(bridge: WsBridge, timeoutMs: number): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (bridge.getStatus().connected) return;
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`Timed out waiting for EDA extension connection (${timeoutMs}ms)`);
}

function pickDeviceRef(searchResult: unknown): { deviceUuid: string; libraryUuid?: string } | undefined {
	const asArray = (v: unknown): Array<any> | undefined => (Array.isArray(v) ? (v as Array<any>) : undefined);
	const asObj = (v: unknown): any | undefined => (v && typeof v === 'object' ? (v as any) : undefined);

	const obj = asObj(searchResult);
	const items = asArray(obj?.items) ?? asArray(searchResult);
	if (!items || items.length === 0) return undefined;

	const first = asObj(items[0]);
	const deviceUuid = first?.deviceUuid ?? first?.uuid ?? first?.id;
	const libraryUuid = first?.libraryUuid ?? first?.libUuid;
	if (typeof deviceUuid !== 'string' || !deviceUuid.trim()) return undefined;
	return { deviceUuid: deviceUuid.trim(), libraryUuid: typeof libraryUuid === 'string' && libraryUuid.trim() ? libraryUuid.trim() : undefined };
}

export async function runSelfTest(
	bridge: WsBridge,
	opts: { timeoutMs: number },
): Promise<{ ok: boolean; status: unknown; steps: Array<StepResult> }> {
	const steps: Array<StepResult> = [];

	const run = async (step: string, fn: () => Promise<unknown>): Promise<unknown | undefined> => {
		try {
			const result = await fn();
			steps.push({ step, ok: true, result });
			return result;
		} catch (err) {
			steps.push({ step, ok: false, error: serializeError(err) });
			return undefined;
		}
	};

	await run('waitForConnected', async () => {
		await waitForConnected(bridge, opts.timeoutMs);
		return bridge.getStatus();
	});

	// Basic connectivity + UI proof.
	await run('ping', async () => await bridge.call('ping', undefined, 10_000));
	await run('showMessage', async () => await bridge.call('showMessage', { message: 'MCP self-test: bridge OK' }, 10_000));

	// Ensure we can operate on a schematic page (will create a floating schematic page if needed).
	await run('ensureSchematicPage', async () => await bridge.call('ensureSchematicPage', { schematicName: 'MCP SelfTest', pageName: 'Sheet1' }, 30_000));

	// Always draw at least one wire to validate coordinate operations.
	await run('wire.create (baseline)', async () => await bridge.call('schematic.createWire', { line: [0, 0, 200, 0], net: 'MCP_TEST' }, 30_000));

	// Optional: place two resistors and connect pins (depends on library availability).
	const searchResult = await run('library.searchDevices (R 0603)', async () => await bridge.call('library.searchDevices', { key: 'R 0603', limit: 5 }, 60_000));
	const ref = pickDeviceRef(searchResult);
	if (ref) {
		const r1 = (await run('schematic.placeDevice (R1)', async () => await bridge.call('schematic.placeDevice', { ...ref, x: 100, y: 100, designator: 'R1' }, 60_000))) as any;
		const r2 = (await run('schematic.placeDevice (R2)', async () => await bridge.call('schematic.placeDevice', { ...ref, x: 300, y: 100, designator: 'R2' }, 60_000))) as any;

		const r1Id = typeof r1?.primitiveId === 'string' ? r1.primitiveId : undefined;
		const r2Id = typeof r2?.primitiveId === 'string' ? r2.primitiveId : undefined;

		if (r1Id && r2Id) {
			await run('schematic.connectPins (R1.2 -> R2.1)', async () => {
				return await bridge.call(
					'schematic.connectPins',
					{ fromPrimitiveId: r1Id, fromPinNumber: '2', toPrimitiveId: r2Id, toPinNumber: '1', net: 'MCP_TEST' },
					60_000,
				);
			});
		}
	}

	await run('schematic.drc', async () => await bridge.call('schematic.drc', { strict: false, userInterface: false }, 120_000));
	await run('schematic.save', async () => await bridge.call('schematic.save', undefined, 120_000));

	const ok = steps.every((s) => s.ok);
	return { ok, status: bridge.getStatus(), steps };
}


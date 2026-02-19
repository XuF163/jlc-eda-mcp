import { BridgeStatusSnapshot } from '../bridge/wsClient';
import { asObject, asString, rpcError } from '../bridge/validate';
import { applySchematicIr } from './applyIr';
import { captureRenderedAreaImage, ensureSchematicPage, exportDocumentFile, getCurrentDocumentInfo, getDocumentSource } from './document';
import {
	clearIndicatorMarkers,
	clearSelection,
	crossProbeSelect,
	findByDesignator,
	listComponents,
	listTexts,
	listWires,
	selectPrimitives,
	showIndicatorMarker,
	zoomToAll,
} from './inspect';
import { getDevice, searchDevices } from './library';
import { connectPins, createWire, exportNetlistFile, getComponentPins, getNetlist, placeDevice, runDrc, saveSchematic } from './schematic';
import { edaGet, edaInvoke, edaKeys } from './edaApi';

export async function handleRpc(
	method: string,
	params: unknown,
	ctx: { getStatus: () => BridgeStatusSnapshot },
): Promise<unknown> {
	switch (method) {
		case 'ping':
			return { pong: true, ts: Date.now() };
		case 'showMessage': {
			const input = params ? asObject(params, 'params') : {};
			const message = asString(input.message, 'message');

			// Best-effort non-blocking notification. Avoid modal dialogs which interrupt workflows.
			try {
				(eda as any).sys_Message?.showToastMessage?.(message, 'info', 4);
				return { shown: true, kind: 'toast' };
			} catch {
				// If toast is unavailable, do not fallback to modal dialogs.
				return { shown: false, kind: 'none' };
			}
		}
		case 'getStatus':
			return ctx.getStatus();
		case 'getCurrentDocumentInfo':
			return await getCurrentDocumentInfo();
		case 'ensureSchematicPage':
			return await ensureSchematicPage(params);
		case 'captureRenderedAreaImage':
			return await captureRenderedAreaImage(params);
		case 'exportDocumentFile':
			return await exportDocumentFile(params);
		case 'getDocumentSource':
			return await getDocumentSource(params);
		case 'exportSchematicNetlistFile':
			return await exportNetlistFile(params);
		case 'schematic.getNetlist':
			return await getNetlist(params);
		case 'library.searchDevices':
			return await searchDevices(params);
		case 'library.getDevice':
			return await getDevice(params);
		case 'schematic.placeDevice':
			return await placeDevice(params);
		case 'schematic.getComponentPins':
			return await getComponentPins(params);
		case 'schematic.connectPins':
			return await connectPins(params);
		case 'schematic.createWire':
			return await createWire(params);
		case 'schematic.drc':
			return await runDrc(params);
		case 'schematic.save':
			return await saveSchematic();
		case 'schematic.applyIr':
			return await applySchematicIr(params);
		case 'schematic.listComponents':
			return await listComponents(params);
		case 'schematic.listWires':
			return await listWires(params);
		case 'schematic.listTexts':
			return await listTexts();
		case 'schematic.findByDesignator':
			return await findByDesignator(params);
		case 'schematic.selectPrimitives':
			return await selectPrimitives(params);
		case 'schematic.crossProbeSelect':
			return await crossProbeSelect(params);
		case 'schematic.clearSelection':
			return await clearSelection();
		case 'schematic.zoomToAll':
			return await zoomToAll(params);
		case 'schematic.indicator.show':
			return await showIndicatorMarker(params);
		case 'schematic.indicator.clear':
			return await clearIndicatorMarkers(params);

		// Full EDA Pro API exposure (advanced):
		// - Allow MCP clients to invoke any `globalThis.eda.*` method by path.
		// - Use with care: this bypasses the usual "explicit tool wrapper" design.
		case 'eda.invoke':
			return await edaInvoke(params);
		case 'eda.get':
			return await edaGet(params);
		case 'eda.keys':
			return await edaKeys(params);
		default:
			throw rpcError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
	}
}

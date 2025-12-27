import { BridgeStatusSnapshot } from '../bridge/wsClient';
import { asObject, asString, rpcError } from '../bridge/validate';
import { applySchematicIr } from './applyIr';
import { captureRenderedAreaImage, ensureSchematicPage, exportDocumentFile, getCurrentDocumentInfo, getDocumentSource } from './document';
import { getDevice, searchDevices } from './library';
import { connectPins, createWire, exportNetlistFile, getComponentPins, placeDevice, runDrc, saveSchematic } from './schematic';

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
			eda.sys_Dialog.showInformationMessage(message, 'MCP');
			return { shown: true };
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
		default:
			throw rpcError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
	}
}

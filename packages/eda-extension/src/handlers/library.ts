import { asObject, asOptionalNumber, asOptionalString, asString, rpcError } from '../bridge/validate';

export async function searchDevices(params: unknown): Promise<unknown> {
	const input = params ? asObject(params, 'params') : {};
	const key = asString(input.key, 'key');
	const libraryUuid = asOptionalString(input.libraryUuid, 'libraryUuid');
	const page = asOptionalNumber(input.page, 'page') ?? 1;
	const limit = asOptionalNumber(input.limit, 'limit') ?? 10;

	const items = await eda.lib_Device.search(key, libraryUuid, undefined, undefined, limit, page);
	return { key, page, limit, items };
}

export async function getDevice(params: unknown): Promise<unknown> {
	const input = params ? asObject(params, 'params') : {};
	const deviceUuid = asString(input.deviceUuid, 'deviceUuid');
	const libraryUuid = asOptionalString(input.libraryUuid, 'libraryUuid');

	const item = await eda.lib_Device.get(deviceUuid, libraryUuid);
	if (!item) throw rpcError('NOT_FOUND', 'Device not found');
	return item;
}

import { asObject, asOptionalBoolean, asOptionalNumber, asOptionalString, asString, rpcError } from '../bridge/validate';

async function requireSchematicPage(): Promise<{ tabId: string; uuid: string }> {
	const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
	if (!info) throw rpcError('NO_ACTIVE_DOCUMENT', 'No active document');
	if (info.documentType !== 1 /* SCHEMATIC_PAGE */) {
		throw rpcError('NOT_IN_SCHEMATIC_PAGE', 'Current document is not a schematic page');
	}
	return { tabId: info.tabId, uuid: info.uuid };
}

function asOptionalStringArray(value: unknown, fieldName: string): Array<string> | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value)) throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be an array of strings`);
	for (const v of value) {
		if (typeof v !== 'string') throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be an array of strings`);
	}
	return value as Array<string>;
}

const AllowedComponentTypes = new Set([
	'part',
	'sheet',
	'netflag',
	'netport',
	'nonElectrical_symbol',
	'short_symbol',
	'netlabel',
	'offPageConnector',
	'diffPairsFlag',
	'block_symbol',
]);

export async function listComponents(params: unknown): Promise<{
	componentType?: string;
	allSchematicPages: boolean;
	total: number;
	items: Array<{
		primitiveId: string;
		componentType: string;
		component?: { libraryUuid: string; uuid: string };
		x: number;
		y: number;
		rotation: number;
		mirror: boolean;
		designator?: string;
		name?: string;
		net?: string;
		subPartName?: string;
		symbol?: { libraryUuid: string; uuid: string };
		footprint?: { libraryUuid: string; uuid: string };
		otherProperty?: Record<string, string | number | boolean>;
		mcp?: { id?: string; type?: string; deviceUuid?: string; libraryUuid?: string };
	}>;
}> {
	await requireSchematicPage();

	const input = params ? asObject(params, 'params') : {};
	const componentType = asOptionalString(input.componentType, 'componentType');
	const allSchematicPages = asOptionalBoolean(input.allSchematicPages, 'allSchematicPages') ?? false;
	const limit = asOptionalNumber(input.limit, 'limit');

	if (componentType && !AllowedComponentTypes.has(componentType)) {
		throw rpcError('INVALID_PARAMS', `Unsupported componentType: ${componentType}`);
	}

	const list = await (eda.sch_PrimitiveComponent as any).getAll(componentType as any, allSchematicPages);
	const items = (Array.isArray(list) ? list : []).map((c: any) => {
		const otherProperty = ((): Record<string, string | number | boolean> | undefined => {
			try {
				const v = c.getState_OtherProperty?.();
				return v && typeof v === 'object' ? (v as any) : undefined;
			} catch {
				return undefined;
			}
		})();

		const mcpId = otherProperty?.__mcp_id != null ? String(otherProperty.__mcp_id) : undefined;
		const mcpType = otherProperty?.__mcp_type != null ? String(otherProperty.__mcp_type) : undefined;
		const mcpDeviceUuid = otherProperty?.__mcp_deviceUuid != null ? String(otherProperty.__mcp_deviceUuid) : undefined;
		const mcpLibraryUuid = otherProperty?.__mcp_libraryUuid != null ? String(otherProperty.__mcp_libraryUuid) : undefined;

		return {
			primitiveId: String(c.getState_PrimitiveId()),
			componentType: String(c.getState_ComponentType()),
			component: c.getState_Component?.(),
			x: Number(c.getState_X()),
			y: Number(c.getState_Y()),
			rotation: Number(c.getState_Rotation?.() ?? 0),
			mirror: Boolean(c.getState_Mirror?.() ?? false),
			designator: c.getState_Designator?.(),
			name: c.getState_Name?.(),
			net: c.getState_Net?.(),
			subPartName: c.getState_SubPartName?.(),
			symbol: c.getState_Symbol?.(),
			footprint: c.getState_Footprint?.(),
			otherProperty,
			mcp: mcpId || mcpType || mcpDeviceUuid || mcpLibraryUuid ? { id: mcpId, type: mcpType, deviceUuid: mcpDeviceUuid, libraryUuid: mcpLibraryUuid } : undefined,
		};
	});

	const limited = Number.isFinite(limit) && limit && limit > 0 ? items.slice(0, Math.floor(limit)) : items;

	return { componentType, allSchematicPages, total: items.length, items: limited };
}

export async function listWires(params: unknown): Promise<{
	net?: string;
	nets?: Array<string>;
	total: number;
	items: Array<{
		primitiveId: string;
		net: string;
		line: Array<number> | Array<Array<number>>;
		color?: string | null;
		lineWidth?: number | null;
		lineType?: string | null;
	}>;
}> {
	await requireSchematicPage();

	const input = params ? asObject(params, 'params') : {};
	const net = asOptionalString(input.net, 'net');
	const nets = asOptionalStringArray(input.nets, 'nets');
	if (net && nets?.length) throw rpcError('INVALID_PARAMS', 'Provide either net or nets, not both');

	const list = await eda.sch_PrimitiveWire.getAll((nets?.length ? nets : net) as any);
	const items = (Array.isArray(list) ? list : []).map((w: any) => ({
		primitiveId: String(w.getState_PrimitiveId()),
		net: String(w.getState_Net?.() ?? ''),
		line: w.getState_Line?.() as any,
		color: w.getState_Color?.() ?? undefined,
		lineWidth: w.getState_LineWidth?.() ?? undefined,
		lineType: w.getState_LineType?.() ?? undefined,
	}));

	return { net, nets, total: items.length, items };
}

export async function listTexts(): Promise<{
	total: number;
	items: Array<{
		primitiveId: string;
		x: number;
		y: number;
		rotation: number;
		content: string;
		textColor?: string | null;
		fontName?: string | null;
		fontSize?: number | null;
		bold?: boolean;
		italic?: boolean;
		underLine?: boolean;
		alignMode?: number;
	}>;
}> {
	await requireSchematicPage();

	const list = await eda.sch_PrimitiveText.getAll();
	const items = (Array.isArray(list) ? list : []).map((t: any) => ({
		primitiveId: String(t.getState_PrimitiveId()),
		x: Number(t.getState_X()),
		y: Number(t.getState_Y()),
		rotation: Number(t.getState_Rotation?.() ?? 0),
		content: String(t.getState_Content?.() ?? ''),
		textColor: t.getState_TextColor?.() ?? undefined,
		fontName: t.getState_FontName?.() ?? undefined,
		fontSize: t.getState_FontSize?.() ?? undefined,
		bold: t.getState_Bold?.() ?? undefined,
		italic: t.getState_Italic?.() ?? undefined,
		underLine: t.getState_UnderLine?.() ?? undefined,
		alignMode: t.getState_AlignMode?.() ?? undefined,
	}));

	return { total: items.length, items };
}

export async function selectPrimitives(params: unknown): Promise<{ ok: boolean; selected: Array<string>; zoomed?: boolean; region?: unknown }> {
	const { tabId } = await requireSchematicPage();

	const input = params ? asObject(params, 'params') : {};
	const primitiveIds = input.primitiveIds;
	if (!Array.isArray(primitiveIds) || primitiveIds.some((v) => typeof v !== 'string' || !v.trim())) {
		throw rpcError('INVALID_PARAMS', 'Expected primitiveIds to be an array of strings');
	}
	const clearFirst = asOptionalBoolean(input.clearFirst, 'clearFirst') ?? true;
	const zoom = asOptionalBoolean(input.zoom, 'zoom') ?? false;

	if (clearFirst) {
		try {
			eda.sch_SelectControl.clearSelected();
		} catch {
			// ignore
		}
	}

	const ok = await eda.sch_SelectControl.doSelectPrimitives(primitiveIds as any);

	let zoomed: boolean | undefined;
	let region: unknown;
	if (zoom) {
		const res = await eda.dmt_EditorControl.zoomToSelectedPrimitives(tabId);
		zoomed = Boolean(res);
		region = res;
	}

	return { ok, selected: primitiveIds as Array<string>, zoomed, region };
}

export async function crossProbeSelect(params: unknown): Promise<{ ok: boolean; zoomed?: boolean; region?: unknown }> {
	const { tabId } = await requireSchematicPage();

	const input = params ? asObject(params, 'params') : {};
	const components = asOptionalStringArray(input.components, 'components');
	const pins = asOptionalStringArray(input.pins, 'pins');
	const nets = asOptionalStringArray(input.nets, 'nets');
	const highlight = asOptionalBoolean(input.highlight, 'highlight');
	const select = asOptionalBoolean(input.select, 'select');
	const zoom = asOptionalBoolean(input.zoom, 'zoom') ?? false;

	const ok = Boolean(eda.sch_SelectControl.doCrossProbeSelect(components as any, pins as any, nets as any, highlight, select));

	let zoomed: boolean | undefined;
	let region: unknown;
	if (zoom) {
		const res = await eda.dmt_EditorControl.zoomToSelectedPrimitives(tabId);
		zoomed = Boolean(res);
		region = res;
	}

	return { ok, zoomed, region };
}

export async function clearSelection(): Promise<{ ok: boolean }> {
	await requireSchematicPage();
	const ok = Boolean(eda.sch_SelectControl.clearSelected());
	return { ok };
}

export async function zoomToAll(params: unknown): Promise<{ ok: boolean; region?: unknown }> {
	const { tabId } = await requireSchematicPage();

	const input = params ? asObject(params, 'params') : {};
	const tabIdInput = asOptionalString(input.tabId, 'tabId');

	const res = await eda.dmt_EditorControl.zoomToAllPrimitives(tabIdInput ?? tabId);
	return { ok: Boolean(res), region: res };
}

export async function showIndicatorMarker(params: unknown): Promise<{ ok: boolean }> {
	const { tabId } = await requireSchematicPage();

	const input = params ? asObject(params, 'params') : {};
	const x = asOptionalNumber(input.x, 'x');
	const y = asOptionalNumber(input.y, 'y');
	const shape = asOptionalString(input.shape, 'shape') ?? 'point';
	const r = asOptionalNumber(input.r, 'r') ?? 20;
	if (x === undefined || y === undefined) throw rpcError('INVALID_PARAMS', 'Expected x and y');

	if (shape !== 'point' && shape !== 'circle') throw rpcError('INVALID_PARAMS', 'shape must be "point" or "circle"');

	const markers = shape === 'circle' ? [{ type: 'circle', x, y, r }] : [{ type: 'point', x, y }];

	const ok = await eda.dmt_EditorControl.generateIndicatorMarkers(markers as any, { r: 255, g: 0, b: 0, alpha: 255 }, 2, true, tabId);
	return { ok };
}

export async function clearIndicatorMarkers(params: unknown): Promise<{ ok: boolean }> {
	const { tabId } = await requireSchematicPage();
	const input = params ? asObject(params, 'params') : {};
	const tabIdInput = asOptionalString(input.tabId, 'tabId');

	const ok = await eda.dmt_EditorControl.removeIndicatorMarkers(tabIdInput ?? tabId);
	return { ok };
}

export async function findByDesignator(params: unknown): Promise<{ designator: string; matches: Array<{ primitiveId: string; name?: string; componentType: string }> }> {
	await requireSchematicPage();

	const input = params ? asObject(params, 'params') : {};
	const designator = asString(input.designator, 'designator').trim();
	if (!designator) throw rpcError('INVALID_PARAMS', 'designator must not be empty');

	const list = await (eda.sch_PrimitiveComponent as any).getAll(undefined, false);
	const matches = (Array.isArray(list) ? list : [])
		.filter((c: any) => String(c.getState_Designator?.() ?? '').toUpperCase() === designator.toUpperCase())
		.map((c: any) => ({
			primitiveId: String(c.getState_PrimitiveId()),
			name: c.getState_Name?.(),
			componentType: String(c.getState_ComponentType()),
		}));

	return { designator, matches };
}

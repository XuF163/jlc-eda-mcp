import { z } from 'zod';
import { createHash } from 'node:crypto';

import type { WsBridge } from '../bridge/wsBridge.js';
import { SchematicIrSchema } from '../ir/schematicIr.js';
import { VerifyNetlistSchema, verifyNetlist } from './verifyNetlist.js';
import { VerifyNetsSchema, verifyNets } from './verifyNets.js';

type ToolHandlerResult = { content: Array<{ type: 'text'; text: string }> };

export type ToolDefinition = {
	name: string;
	description: string;
	inputSchema: unknown;
	run: (args: unknown) => Promise<ToolHandlerResult>;
};

function asJsonText(value: unknown): ToolHandlerResult {
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(value, null, 2),
			},
		],
	};
}

const EmptySchema = z.object({});

const CaptureRenderedAreaSchema = z.object({
	tabId: z.string().min(1).optional(),
	zoomToAll: z.boolean().optional(),
	savePath: z.string().min(1).optional(),
	fileName: z.string().min(1).optional(),
	force: z.boolean().optional(),
});

const ExportDocumentFileSchema = z.object({
	fileType: z.enum(['.epro', '.epro2']).optional(),
	password: z.string().optional(),
	savePath: z.string().min(1).optional(),
	fileName: z.string().min(1).optional(),
	force: z.boolean().optional(),
});

const GetDocumentSourceSchema = z.object({
	maxChars: z.number().int().positive().optional(),
});

const ExportNetlistSchema = z.object({
	netlistType: z.string().min(1).optional(),
	savePath: z.string().min(1).optional(),
	fileName: z.string().min(1).optional(),
	force: z.boolean().optional(),
});

const GetNetlistSchema = z.object({
	netlistType: z.string().min(1).optional(),
	maxChars: z.number().int().positive().optional(),
	timeoutMs: z.number().int().positive().optional(),
});

const SearchDevicesSchema = z.object({
	key: z.string().min(1),
	libraryUuid: z.string().min(1).optional(),
	page: z.number().int().positive().optional(),
	limit: z.number().int().positive().max(100).optional(),
});

const PlaceDeviceSchema = z.object({
	deviceUuid: z.string().min(1),
	libraryUuid: z.string().min(1).optional(),
	x: z.number(),
	y: z.number(),
	subPartName: z.string().min(1).optional(),
	rotation: z.number().optional(),
	mirror: z.boolean().optional(),
	addIntoBom: z.boolean().optional(),
	addIntoPcb: z.boolean().optional(),
	designator: z.string().optional(),
	name: z.union([z.string(), z.null()]).optional(),
});

const GetComponentPinsSchema = z.object({
	primitiveId: z.string().min(1),
});

const ConnectPinsSchema = z
	.object({
		fromPrimitiveId: z.string().min(1),
		fromPinNumber: z.string().min(1).optional(),
		fromPinName: z.string().min(1).optional(),
		toPrimitiveId: z.string().min(1),
		toPinNumber: z.string().min(1).optional(),
		toPinName: z.string().min(1).optional(),
		net: z.string().min(1).optional(),
		style: z.enum(['manhattan', 'straight']).optional(),
		midX: z.number().optional(),
	})
	.superRefine((v, ctx) => {
		if (!v.fromPinNumber && !v.fromPinName) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fromPinNumber or fromPinName is required' });
		}
		if (!v.toPinNumber && !v.toPinName) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'toPinNumber or toPinName is required' });
		}
	});

const CreateWireSchema = z.object({
	line: z.union([z.array(z.number()), z.array(z.array(z.number()))]),
	net: z.string().min(1).optional(),
});

function makeStableId(prefix: string, raw: string): string {
	const digest = createHash('sha1').update(raw).digest('hex').slice(0, 10);
	return `${prefix}_${digest}`;
}

const AttachNetLabelToPinSchema = z
	.object({
		id: z.string().min(1).optional(),
		primitiveId: z.string().min(1),
		pinNumber: z.string().min(1).optional(),
		pinName: z.string().min(1).optional(),
		net: z.string().min(1),
		direction: z.enum(['left', 'right', 'up', 'down']).optional(),
		length: z.number().positive().optional(),
	})
	.superRefine((v, ctx) => {
		if (!v.pinNumber && !v.pinName) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pinNumber or pinName is required' });
		}
	});

const ListComponentsSchema = z.object({
	componentType: z.string().min(1).optional(),
	allSchematicPages: z.boolean().optional(),
	limit: z.number().int().positive().optional(),
});

const ListWiresSchema = z
	.object({
		net: z.string().min(1).optional(),
		nets: z.array(z.string().min(1)).optional(),
	})
	.superRefine((v, ctx) => {
		if (v.net && v.nets?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide either net or nets, not both' });
	});

const FindByDesignatorSchema = z.object({
	designator: z.string().min(1),
});

const SelectPrimitivesSchema = z.object({
	primitiveIds: z.array(z.string().min(1)).min(1),
	clearFirst: z.boolean().optional(),
	zoom: z.boolean().optional(),
});

const CrossProbeSelectSchema = z.object({
	components: z.array(z.string().min(1)).optional(),
	pins: z.array(z.string().min(1)).optional(),
	nets: z.array(z.string().min(1)).optional(),
	highlight: z.boolean().optional(),
	select: z.boolean().optional(),
	zoom: z.boolean().optional(),
});

const ZoomToAllSchema = z.object({
	tabId: z.string().min(1).optional(),
});

const IndicatorShowSchema = z.object({
	x: z.number(),
	y: z.number(),
	shape: z.enum(['point', 'circle']).optional(),
	r: z.number().positive().optional(),
});

const IndicatorClearSchema = z.object({
	tabId: z.string().min(1).optional(),
});

const SnapshotSchema = z.object({
	includeComponents: z.boolean().optional(),
	includeWires: z.boolean().optional(),
	includeTexts: z.boolean().optional(),
});

const DrcSchema = z.object({
	strict: z.boolean().optional(),
	userInterface: z.boolean().optional(),
});

const ApplyIrSchema = z.object({
	ir: SchematicIrSchema,
});

export function createToolRegistry(bridge: WsBridge): Array<ToolDefinition> {
	return [
		{
			name: 'jlc.status',
			description: 'Get bridge connection status (JLCEDA local extension <-> MCP).',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: async (args) => {
				EmptySchema.parse(args);
				return asJsonText(bridge.getStatus());
			},
		},
		{
			name: 'jlc.bridge.ping',
			description: 'Ping the running JLCEDA extension bridge.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: async (args) => {
				EmptySchema.parse(args);
				const result = await bridge.call('ping', undefined, 10_000);
				return asJsonText({ ok: true, result });
			},
		},
		{
			name: 'jlc.bridge.show_message',
			description: 'Show a non-blocking toast in the JLCEDA client via the extension bridge (best-effort; may no-op).',
			inputSchema: {
				type: 'object',
				properties: { message: { type: 'string' } },
				required: ['message'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = z.object({ message: z.string().min(1) }).parse(args);
				const result = await bridge.call('showMessage', { message: parsed.message }, 10_000);
				return asJsonText({ ok: true, result });
			},
		},

		{
			name: 'jlc.document.current',
			description: 'Get current focused document info from JLCEDA (documentType/uuid/tabId).',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: async (args) => {
				EmptySchema.parse(args);
				const result = await bridge.call('getCurrentDocumentInfo', undefined, 10_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.ensure_page',
			description: 'Ensure a schematic page is open and focused; create a floating schematic/page if needed.',
			inputSchema: {
				type: 'object',
				properties: {
					boardName: { type: 'string' },
					schematicName: { type: 'string' },
					pageName: { type: 'string' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = z
					.object({
						boardName: z.string().min(1).optional(),
						schematicName: z.string().min(1).optional(),
						pageName: z.string().min(1).optional(),
					})
					.parse(args);
				const result = await bridge.call('ensureSchematicPage', parsed, 30_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.view.capture_png',
			description:
				'Capture the current rendered area image (PNG) and save to file system (defaults to EDA path if available).',
			inputSchema: {
				type: 'object',
				properties: {
					tabId: { type: 'string' },
					zoomToAll: { type: 'boolean' },
					savePath: { type: 'string' },
					fileName: { type: 'string' },
					force: { type: 'boolean' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = CaptureRenderedAreaSchema.parse(args);
				const result = await bridge.call('captureRenderedAreaImage', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.document.export_epro2',
			description: 'Export current document as .epro2 (or .epro) and save to file system.',
			inputSchema: {
				type: 'object',
				properties: {
					fileType: { type: 'string', enum: ['.epro', '.epro2'] },
					password: { type: 'string' },
					savePath: { type: 'string' },
					fileName: { type: 'string' },
					force: { type: 'boolean' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = ExportDocumentFileSchema.parse(args);
				const result = await bridge.call('exportDocumentFile', parsed, 120_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.document.get_source',
			description: 'Get current document source (may be large; default maxChars=200000).',
			inputSchema: {
				type: 'object',
				properties: {
					maxChars: { type: 'number' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = GetDocumentSourceSchema.parse(args);
				const result = await bridge.call('getDocumentSource', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.export_netlist',
			description: 'Export netlist file from current schematic page and save to file system.',
			inputSchema: {
				type: 'object',
				properties: {
					netlistType: { type: 'string' },
					savePath: { type: 'string' },
					fileName: { type: 'string' },
					force: { type: 'boolean' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = ExportNetlistSchema.parse(args);
				const result = await bridge.call('exportSchematicNetlistFile', parsed, 120_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.get_netlist',
			description: 'Get netlist text from current schematic (no file export).',
			inputSchema: {
				type: 'object',
				properties: {
					netlistType: { type: 'string' },
					maxChars: { type: 'number' },
					timeoutMs: { type: 'number' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = GetNetlistSchema.parse(args);
				const result = await bridge.call('schematic.getNetlist', parsed, 120_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.library.search_devices',
			description: 'Search built-in device library (prefers system library by default).',
			inputSchema: {
				type: 'object',
				properties: {
					key: { type: 'string' },
					libraryUuid: { type: 'string' },
					page: { type: 'number' },
					limit: { type: 'number' },
				},
				required: ['key'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = SearchDevicesSchema.parse(args);
				const result = await bridge.call('library.searchDevices', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.place_device',
			description: 'Place a device (component) onto the current schematic page by deviceUuid + coordinates.',
			inputSchema: {
				type: 'object',
				properties: {
					deviceUuid: { type: 'string' },
					libraryUuid: { type: 'string' },
					x: { type: 'number' },
					y: { type: 'number' },
					subPartName: { type: 'string' },
					rotation: { type: 'number' },
					mirror: { type: 'boolean' },
					addIntoBom: { type: 'boolean' },
					addIntoPcb: { type: 'boolean' },
					designator: { type: 'string' },
					name: { type: ['string', 'null'] },
				},
				required: ['deviceUuid', 'x', 'y'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = PlaceDeviceSchema.parse(args);
				const result = await bridge.call('schematic.placeDevice', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.get_component_pins',
			description: 'Get pins (coordinates + names/numbers) for a placed component primitiveId.',
			inputSchema: {
				type: 'object',
				properties: {
					primitiveId: { type: 'string' },
				},
				required: ['primitiveId'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = GetComponentPinsSchema.parse(args);
				const result = await bridge.call('schematic.getComponentPins', parsed, 30_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.list_components',
			description: 'List schematic components on the current page (includes net ports/flags).',
			inputSchema: {
				type: 'object',
				properties: {
					componentType: { type: 'string' },
					allSchematicPages: { type: 'boolean' },
					limit: { type: 'number' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = ListComponentsSchema.parse(args);
				const result = await bridge.call('schematic.listComponents', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.list_wires',
			description: 'List schematic wires on the current page (optionally filter by net name).',
			inputSchema: {
				type: 'object',
				properties: {
					net: { type: 'string' },
					nets: { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = ListWiresSchema.parse(args);
				const result = await bridge.call('schematic.listWires', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.list_texts',
			description: 'List schematic text primitives on the current page.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: async (args) => {
				EmptySchema.parse(args);
				const result = await bridge.call('schematic.listTexts', undefined, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.find_by_designator',
			description: 'Find component primitives by designator (e.g. R1/U2).',
			inputSchema: {
				type: 'object',
				properties: { designator: { type: 'string' } },
				required: ['designator'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = FindByDesignatorSchema.parse(args);
				const result = await bridge.call('schematic.findByDesignator', parsed, 30_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.select',
			description: 'Select primitives by primitiveId (optionally zoom to selection).',
			inputSchema: {
				type: 'object',
				properties: {
					primitiveIds: { type: 'array', items: { type: 'string' } },
					clearFirst: { type: 'boolean' },
					zoom: { type: 'boolean' },
				},
				required: ['primitiveIds'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = SelectPrimitivesSchema.parse(args);
				const result = await bridge.call('schematic.selectPrimitives', parsed, 30_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.crossprobe_select',
			description: 'Select/highlight schematic objects by components/pins/nets (cross-probe).',
			inputSchema: {
				type: 'object',
				properties: {
					components: { type: 'array', items: { type: 'string' } },
					pins: { type: 'array', items: { type: 'string' } },
					nets: { type: 'array', items: { type: 'string' } },
					highlight: { type: 'boolean' },
					select: { type: 'boolean' },
					zoom: { type: 'boolean' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = CrossProbeSelectSchema.parse(args);
				const result = await bridge.call('schematic.crossProbeSelect', parsed, 30_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.clear_selection',
			description: 'Clear schematic selection.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: async (args) => {
				EmptySchema.parse(args);
				const result = await bridge.call('schematic.clearSelection', undefined, 10_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.zoom_to_all',
			description: 'Zoom to fit all primitives on the current schematic page.',
			inputSchema: {
				type: 'object',
				properties: { tabId: { type: 'string' } },
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = ZoomToAllSchema.parse(args);
				const result = await bridge.call('schematic.zoomToAll', parsed, 30_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.indicator.show',
			description: 'Show a temporary red indicator marker on the schematic canvas (for debugging).',
			inputSchema: {
				type: 'object',
				properties: {
					x: { type: 'number' },
					y: { type: 'number' },
					shape: { type: 'string', enum: ['point', 'circle'] },
					r: { type: 'number' },
				},
				required: ['x', 'y'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = IndicatorShowSchema.parse(args);
				const result = await bridge.call('schematic.indicator.show', parsed, 10_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.indicator.clear',
			description: 'Clear all indicator markers on the schematic canvas.',
			inputSchema: {
				type: 'object',
				properties: { tabId: { type: 'string' } },
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = IndicatorClearSchema.parse(args);
				const result = await bridge.call('schematic.indicator.clear', parsed, 10_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.snapshot',
			description: 'Export a structured snapshot (components/wires/texts) for LLM readback and incremental edits.',
			inputSchema: {
				type: 'object',
				properties: {
					includeComponents: { type: 'boolean' },
					includeWires: { type: 'boolean' },
					includeTexts: { type: 'boolean' },
				},
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = SnapshotSchema.parse(args);
				const includeComponents = parsed.includeComponents ?? true;
				const includeWires = parsed.includeWires ?? true;
				const includeTexts = parsed.includeTexts ?? true;

				const doc = await bridge.call('getCurrentDocumentInfo', undefined, 10_000);
				const components = includeComponents ? await bridge.call('schematic.listComponents', {}, 60_000) : undefined;
				const wires = includeWires ? await bridge.call('schematic.listWires', {}, 60_000) : undefined;
				const texts = includeTexts ? await bridge.call('schematic.listTexts', undefined, 60_000) : undefined;

				return asJsonText({ ok: true, doc, snapshot: { components, wires, texts } });
			},
		},
		{
			name: 'jlc.schematic.connect_pins',
			description: 'Connect two component pins by creating a wire (auto manhattan routing).',
			inputSchema: {
				type: 'object',
				properties: {
					fromPrimitiveId: { type: 'string' },
					fromPinNumber: { type: 'string' },
					fromPinName: { type: 'string' },
					toPrimitiveId: { type: 'string' },
					toPinNumber: { type: 'string' },
					toPinName: { type: 'string' },
					net: { type: 'string' },
					style: { type: 'string', enum: ['manhattan', 'straight'] },
					midX: { type: 'number' },
				},
				required: ['fromPrimitiveId', 'toPrimitiveId'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = ConnectPinsSchema.parse(args);
				const result = await bridge.call('schematic.connectPins', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.netlabel.attach_pin',
			description:
				'Attach a Net Label (wire NET attribute, like Alt+N) to a component pin by creating/updating a short labeled wire segment. Does NOT create Net Ports.',
			inputSchema: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					primitiveId: { type: 'string' },
					pinNumber: { type: 'string' },
					pinName: { type: 'string' },
					net: { type: 'string' },
					direction: { type: 'string', enum: ['left', 'right', 'up', 'down'] },
					length: { type: 'number' },
				},
				required: ['primitiveId', 'net'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = AttachNetLabelToPinSchema.parse(args);

				const pinsResult = (await bridge.call('schematic.getComponentPins', { primitiveId: parsed.primitiveId }, 30_000)) as any;
				const pins: Array<any> = Array.isArray(pinsResult?.pins) ? pinsResult.pins : [];
				if (!pins.length) throw new Error(`No pins found for primitiveId=${parsed.primitiveId}`);

				const findPin = (): any => {
					if (parsed.pinNumber) {
						const matches = pins.filter((p) => String(p?.pinNumber) === parsed.pinNumber);
						if (matches.length === 1) return matches[0];
						if (matches.length > 1) throw new Error(`Ambiguous pinNumber=${parsed.pinNumber}`);
					}
					if (parsed.pinName) {
						const matches = pins.filter((p) => String(p?.pinName) === parsed.pinName);
						if (matches.length === 1) return matches[0];
						if (matches.length > 1) throw new Error(`Ambiguous pinName=${parsed.pinName}`);
					}
					throw new Error(`Pin not found (primitiveId=${parsed.primitiveId}, pinNumber=${parsed.pinNumber ?? ''}, pinName=${parsed.pinName ?? ''})`);
				};

				const pin = findPin();
				const x1 = Number(pin?.x);
				const y1 = Number(pin?.y);
				if (!Number.isFinite(x1) || !Number.isFinite(y1)) throw new Error('Pin coordinates are invalid');

				const length = parsed.length ?? 40;
				const direction = parsed.direction ?? 'right';
				const dx = direction === 'left' ? -length : direction === 'right' ? length : 0;
				const dy = direction === 'up' ? -length : direction === 'down' ? length : 0;
				const line = [x1, y1, x1 + dx, y1 + dy];

				const id =
					parsed.id ??
					makeStableId(
						'NL',
						[parsed.primitiveId, parsed.pinNumber ?? '', parsed.pinName ?? '', parsed.net].map((s) => String(s)).join('|'),
					);

				const ir = {
					version: 1 as const,
					units: 'sch' as const,
					page: { ensure: false },
					wires: [{ id, net: parsed.net, line }],
				};

				const applyResult = await bridge.call('schematic.applyIr', ir, 120_000);

				return asJsonText({
					ok: true,
					id,
					net: parsed.net,
					line,
					applied: (applyResult as any)?.applied?.wires?.[id],
					note:
						'Net Label in JLCEDA Pro is implemented as Wire.NET. Avoid mixing netPorts/netFlags with wires[].net on the same short segment to prevent duplicate net name rendering.',
				});
			},
		},
		{
			name: 'jlc.schematic.wire.create',
			description: 'Create a wire by explicit polyline coordinates.',
			inputSchema: {
				type: 'object',
				properties: {
					line: {
						oneOf: [
							{ type: 'array', items: { type: 'number' } },
							{ type: 'array', items: { type: 'array', items: { type: 'number' } } },
						],
					},
					net: { type: 'string' },
				},
				required: ['line'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = CreateWireSchema.parse(args);
				const result = await bridge.call('schematic.createWire', parsed, 60_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.drc',
			description: 'Run schematic DRC check.',
			inputSchema: {
				type: 'object',
				properties: { strict: { type: 'boolean' }, userInterface: { type: 'boolean' } },
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = DrcSchema.parse(args);
				const result = await bridge.call('schematic.drc', parsed, 120_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.save',
			description: 'Save current schematic document.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: async (args) => {
				EmptySchema.parse(args);
				const result = await bridge.call('schematic.save', undefined, 120_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.apply_ir',
			description:
				'Apply a coordinate-based SchematicIR v1 to create a complete schematic (place devices/flags/ports/text/wires + optional DRC/save/capture).',
			inputSchema: {
				type: 'object',
				properties: {
					ir: { type: 'object' },
				},
				required: ['ir'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = ApplyIrSchema.parse(args);
				const result = await bridge.call('schematic.applyIr', parsed.ir, 300_000);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.verify_nets',
			description:
				'Verify connectivity by parsing document source wire primitives (fallback when EDA netlist export is slow/unavailable).',
			inputSchema: {
				type: 'object',
				properties: {
					nets: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								wirePrimitiveIds: { type: 'array', items: { type: 'string' } },
								points: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											ref: { type: 'string' },
											x: { type: 'number' },
											y: { type: 'number' },
											primitiveId: { type: 'string' },
											pinNumber: { type: 'string' },
											pinName: { type: 'string' },
											allowMany: { type: 'boolean' },
										},
										additionalProperties: false,
									},
								},
							},
							required: ['name', 'points'],
							additionalProperties: false,
						},
					},
					requireConnected: { type: 'boolean' },
					maxChars: { type: 'number' },
					timeoutMs: { type: 'number' },
				},
				required: ['nets'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = VerifyNetsSchema.parse(args);
				const result = await verifyNets(bridge, parsed);
				return asJsonText(result);
			},
		},
		{
			name: 'jlc.schematic.verify_netlist',
			description: 'Verify connectivity by reading SCH_Netlist.getNetlist() and checking expected (Net -> Ref.Pin) memberships.',
			inputSchema: {
				type: 'object',
				properties: {
					netlistType: { type: 'string', enum: ['JLCEDA', 'EasyEDA', 'Protel2', 'PADS', 'Allegro', 'DISA'] },
					timeoutMs: { type: 'number' },
					maxChars: { type: 'number' },
					nets: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								endpoints: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											ref: { type: 'string' },
											pin: { type: 'string' },
										},
										required: ['ref', 'pin'],
										additionalProperties: false,
									},
								},
							},
							required: ['name', 'endpoints'],
							additionalProperties: false,
						},
					},
				},
				required: ['nets'],
				additionalProperties: false,
			},
			run: async (args) => {
				const parsed = VerifyNetlistSchema.parse(args);
				const result = await verifyNetlist(bridge, parsed);
				return asJsonText(result);
			},
		},
	];
}

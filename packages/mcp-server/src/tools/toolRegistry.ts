import { z } from 'zod';

import type { WsBridge } from '../bridge/wsBridge.js';
import { SchematicIrSchema } from '../ir/schematicIr.js';

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
			description: 'Show a message in the JLCEDA client via the extension bridge.',
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
	];
}

import { z } from 'zod';

export const UnitsSchema = z.enum(['sch', 'mm']).default('sch');

const PageSchema = z
	.object({
		ensure: z.boolean().optional(),
		boardName: z.string().min(1).optional(),
		schematicName: z.string().min(1).optional(),
		pageName: z.string().min(1).optional(),
		clear: z.boolean().optional(),
		clearMode: z.enum(['mcp', 'all']).optional(),
	})
	.optional();

const ComponentSchema = z.object({
	id: z.string().min(1),
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

const NetFlagSchema = z.object({
	id: z.string().min(1),
	identification: z.enum(['Power', 'Ground', 'AnalogGround', 'ProtectGround']),
	net: z.string().min(1),
	x: z.number(),
	y: z.number(),
	rotation: z.number().optional(),
	mirror: z.boolean().optional(),
});

const NetPortSchema = z.object({
	id: z.string().min(1),
	direction: z.enum(['IN', 'OUT', 'BI']),
	net: z.string().min(1),
	x: z.number(),
	y: z.number(),
	rotation: z.number().optional(),
	mirror: z.boolean().optional(),
});

const WireSchema = z.object({
	id: z.string().min(1),
	net: z.string().min(1).optional(),
	line: z.union([z.array(z.number()), z.array(z.array(z.number()))]),
});

const TextSchema = z.object({
	id: z.string().min(1),
	x: z.number(),
	y: z.number(),
	content: z.string().min(1),
	rotation: z.number().optional(),
	textColor: z.string().optional().nullable(),
	fontName: z.string().optional().nullable(),
	fontSize: z.number().optional().nullable(),
	bold: z.boolean().optional(),
	italic: z.boolean().optional(),
	underLine: z.boolean().optional(),
	alignMode: z.number().int().optional(),
});

const ConnectionEndpointSchema = z
	.object({
		componentId: z.string().min(1),
		pinNumber: z.string().min(1).optional(),
		pinName: z.string().min(1).optional(),
	})
	.superRefine((v, ctx) => {
		if (!v.pinNumber && !v.pinName) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pinNumber or pinName is required' });
		}
	});

const ConnectionSchema = z.object({
	id: z.string().min(1),
	from: ConnectionEndpointSchema,
	to: ConnectionEndpointSchema,
	net: z.string().min(1).optional(),
	style: z.enum(['manhattan', 'straight']).optional(),
	midX: z.number().optional(),
});

const PostSchema = z
	.object({
		drc: z
			.object({
				strict: z.boolean().optional(),
				userInterface: z.boolean().optional(),
			})
			.optional(),
		save: z.boolean().optional(),
		zoomToAll: z.boolean().optional(),
		capturePng: z
			.object({
				savePath: z.string().min(1).optional(),
				fileName: z.string().min(1).optional(),
				force: z.boolean().optional(),
			})
			.optional(),
	})
	.optional();

const PatchSchema = z
	.object({
		delete: z
			.object({
				components: z.array(z.string().min(1)).optional(),
				netFlags: z.array(z.string().min(1)).optional(),
				netPorts: z.array(z.string().min(1)).optional(),
				texts: z.array(z.string().min(1)).optional(),
				wires: z.array(z.string().min(1)).optional(),
				connections: z.array(z.string().min(1)).optional(),
			})
			.optional(),
	})
	.optional();

export const SchematicIrSchema = z.object({
	version: z.literal(1),
	units: UnitsSchema.optional(),
	page: PageSchema,
	patch: PatchSchema,
	components: z.array(ComponentSchema).optional(),
	netFlags: z.array(NetFlagSchema).optional(),
	netPorts: z.array(NetPortSchema).optional(),
	texts: z.array(TextSchema).optional(),
	wires: z.array(WireSchema).optional(),
	connections: z.array(ConnectionSchema).optional(),
	post: PostSchema,
});

export type SchematicIrV1 = z.infer<typeof SchematicIrSchema>;

import { z } from 'zod';

import { rpcError } from '../bridge/validate';

const STORAGE_PREFIX = 'jlceda_mcp_schematic_map_v1:';

const IdSchema = z.string().min(1);

const ComponentEntrySchema = z.object({
	primitiveId: IdSchema,
	deviceUuid: IdSchema,
	libraryUuid: IdSchema,
});

const NetFlagEntrySchema = z.object({
	primitiveId: IdSchema,
	identification: z.enum(['Power', 'Ground', 'AnalogGround', 'ProtectGround']),
	net: IdSchema,
});

const NetPortEntrySchema = z.object({
	primitiveId: IdSchema,
	direction: z.enum(['IN', 'OUT', 'BI']),
	net: IdSchema,
});

const SimpleEntrySchema = z.object({
	primitiveId: IdSchema,
});

export const SchematicMapSchema = z.object({
	version: z.literal(1),
	components: z.record(z.string(), ComponentEntrySchema).default({}),
	netFlags: z.record(z.string(), NetFlagEntrySchema).default({}),
	netPorts: z.record(z.string(), NetPortEntrySchema).default({}),
	texts: z.record(z.string(), SimpleEntrySchema).default({}),
	wires: z.record(z.string(), SimpleEntrySchema).default({}),
	connections: z.record(z.string(), SimpleEntrySchema).default({}),
});

export type SchematicMapV1 = z.infer<typeof SchematicMapSchema>;

export function getSchematicMapStorageKey(schematicPageUuid: string): string {
	return `${STORAGE_PREFIX}${schematicPageUuid}`;
}

export function createEmptySchematicMap(): SchematicMapV1 {
	return SchematicMapSchema.parse({ version: 1 });
}

export function loadSchematicMap(schematicPageUuid: string): SchematicMapV1 {
	const key = getSchematicMapStorageKey(schematicPageUuid);
	const raw = eda.sys_Storage.getExtensionUserConfig(key);
	if (!raw) return createEmptySchematicMap();

	const parsed = SchematicMapSchema.safeParse(raw);
	if (!parsed.success) return createEmptySchematicMap();
	return parsed.data;
}

export async function saveSchematicMap(schematicPageUuid: string, map: SchematicMapV1): Promise<void> {
	const key = getSchematicMapStorageKey(schematicPageUuid);
	const ok = await eda.sys_Storage.setExtensionUserConfig(key, map);
	if (!ok) throw rpcError('STORAGE_WRITE_FAILED', 'Failed to persist schematic map');
}

export async function deleteSchematicMap(schematicPageUuid: string): Promise<void> {
	const key = getSchematicMapStorageKey(schematicPageUuid);
	await eda.sys_Storage.deleteExtensionUserConfig(key);
}

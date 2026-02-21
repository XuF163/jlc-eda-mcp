import { z } from 'zod';

import { rpcError, safeFileName } from '../bridge/validate';
import { SchematicIrSchema, type SchematicIrV1, type Units } from '../ir/schematicIr';
import { createEmptySchematicMap, loadSchematicMap, saveSchematicMap, type SchematicMapV1 } from '../state/schematicMap';
import { captureRenderedAreaImage, ensureSchematicPage } from './document';

const SCH_UNITS_PER_MM = 1 / 0.254; // 0.01 inch == 0.254 mm

function toSchUnits(value: number, units: Units): number {
	if (units === 'mm') return value * SCH_UNITS_PER_MM;
	return value;
}

function mapLine(line: Array<number> | Array<Array<number>>, units: Units): Array<number> | Array<Array<number>> {
	if (Array.isArray(line) && typeof line[0] === 'number') {
		return (line as Array<number>).map((n) => toSchUnits(n, units));
	}
	return (line as Array<Array<number>>).map((seg) => seg.map((n) => toSchUnits(n, units)));
}

function ensureUniqueIds(items: Array<{ id: string }>, label: string): void {
	const seen = new Set<string>();
	for (const item of items) {
		if (seen.has(item.id)) throw rpcError('DUPLICATE_ID', `Duplicate ${label} id: ${item.id}`);
		seen.add(item.id);
	}
}

async function clearCurrentSchematicPage(): Promise<{ wires: number; texts: number; components: number }> {
	const wireIds = await eda.sch_PrimitiveWire.getAllPrimitiveId();
	if (wireIds.length) {
		await eda.sch_PrimitiveWire.delete(wireIds);
	}

	const textIds = await eda.sch_PrimitiveText.getAllPrimitiveId();
	if (textIds.length) {
		await eda.sch_PrimitiveText.delete(textIds);
	}

	const componentIds = await (eda.sch_PrimitiveComponent as any).getAllPrimitiveId(undefined, false);
	if (componentIds.length) {
		await (eda.sch_PrimitiveComponent as any).delete(componentIds);
	}

	return { wires: wireIds.length, texts: textIds.length, components: componentIds.length };
}

async function requireSchematicPage(): Promise<{ tabId: string; uuid: string }> {
	const info = await eda.dmt_SelectControl.getCurrentDocumentInfo();
	if (!info) throw rpcError('NO_ACTIVE_DOCUMENT', 'No active document');
	if (info.documentType !== 1 /* SCHEMATIC_PAGE */) throw rpcError('NOT_IN_SCHEMATIC_PAGE', 'Current document is not a schematic page');
	return { tabId: info.tabId, uuid: info.uuid };
}

async function resolveDeviceRef(deviceUuid: string, libraryUuid?: string): Promise<{ uuid: string; libraryUuid: string }> {
	if (libraryUuid) return { uuid: deviceUuid, libraryUuid };
	const device = await eda.lib_Device.get(deviceUuid);
	if (!device) throw rpcError('NOT_FOUND', `Device not found: ${deviceUuid}`);
	return { uuid: device.uuid, libraryUuid: device.libraryUuid };
}

type Pin = {
	getState_PrimitiveId: () => string;
	getState_X: () => number;
	getState_Y: () => number;
	getState_PinNumber: () => string;
	getState_PinName: () => string;
};

function selectPin(pins: Array<Pin>, selector: { pinNumber?: string; pinName?: string }, label: string): Pin {
	if (selector.pinNumber) {
		const matches = pins.filter((p) => String(p.getState_PinNumber()) === selector.pinNumber);
		if (matches.length === 1) return matches[0];
		if (matches.length > 1) throw rpcError('AMBIGUOUS_PIN', `Multiple pins match ${label}.pinNumber=${selector.pinNumber}`);
	}

	if (selector.pinName) {
		const matches = pins.filter((p) => String(p.getState_PinName()) === selector.pinName);
		if (matches.length === 1) return matches[0];
		if (matches.length > 1) throw rpcError('AMBIGUOUS_PIN', `Multiple pins match ${label}.pinName=${selector.pinName}`);
	}

	throw rpcError('PIN_NOT_FOUND', `Pin not found for ${label} (provide pinNumber or pinName)`);
}

async function clearManagedPrimitives(map: SchematicMapV1): Promise<{ wires: number; texts: number; components: number }> {
	const wireIds = [
		...Object.values(map.wires).map((w) => w.primitiveId),
		...Object.values(map.connections).map((w) => w.primitiveId),
	];
	const textIds = Object.values(map.texts).map((t) => t.primitiveId);
	const componentIds = [
		...Object.values(map.components).map((c) => c.primitiveId),
		...Object.values(map.netFlags).map((c) => c.primitiveId),
		...Object.values(map.netPorts).map((c) => c.primitiveId),
	];

	if (wireIds.length) {
		try {
			await eda.sch_PrimitiveWire.delete(wireIds);
		} catch {
			// ignore
		}
	}

	if (textIds.length) {
		try {
			await eda.sch_PrimitiveText.delete(textIds);
		} catch {
			// ignore
		}
	}

	if (componentIds.length) {
		try {
			await (eda.sch_PrimitiveComponent as any).delete(componentIds);
		} catch {
			// ignore
		}
	}

	return { wires: wireIds.length, texts: textIds.length, components: componentIds.length };
}

async function updateComponentPrimitiveInPlace(
	primitiveId: string,
	patch: {
		x?: number;
		y?: number;
		rotation?: number;
		mirror?: boolean;
		net?: string;
		otherProperty?: Record<string, string | number | boolean>;
	},
): Promise<boolean> {
	try {
		const primitive = await eda.sch_Primitive.getPrimitiveByPrimitiveId(primitiveId);
		if (!primitive) return false;

		const p: any = typeof (primitive as any).toAsync === 'function' ? (primitive as any).toAsync() : primitive;

		if (patch.x !== undefined && typeof p.setState_X === 'function') p.setState_X(patch.x);
		if (patch.y !== undefined && typeof p.setState_Y === 'function') p.setState_Y(patch.y);
		if (patch.rotation !== undefined && typeof p.setState_Rotation === 'function') p.setState_Rotation(patch.rotation);
		if (patch.mirror !== undefined && typeof p.setState_Mirror === 'function') p.setState_Mirror(patch.mirror);
		if (patch.net !== undefined && typeof p.setState_Net === 'function') p.setState_Net(patch.net);
		if (patch.otherProperty && typeof p.setState_OtherProperty === 'function') p.setState_OtherProperty(patch.otherProperty);

		if (typeof p.done !== 'function') return false;
		await p.done();
		return true;
	} catch {
		return false;
	}
}

export async function applySchematicIr(params: unknown): Promise<unknown> {
	let ir: SchematicIrV1;
	try {
		ir = SchematicIrSchema.parse(params);
	} catch (e) {
		if (e instanceof z.ZodError) {
			throw rpcError('INVALID_IR', 'Invalid SchematicIR', e.flatten());
		}
		throw e;
	}

	const units: Units = ir.units ?? 'sch';

	ensureUniqueIds(ir.components, 'component');
	ensureUniqueIds(ir.netFlags, 'netFlag');
	ensureUniqueIds(ir.netPorts, 'netPort');
	ensureUniqueIds(ir.texts, 'text');
	ensureUniqueIds(ir.wires, 'wire');
	ensureUniqueIds(ir.connections, 'connection');

	eda.sys_LoadingAndProgressBar.showProgressBar(0, 'MCP: Applying schematic');
	try {
		// 1) Ensure page
		if (ir.page?.ensure ?? true) {
			await ensureSchematicPage({
				boardName: ir.page?.boardName,
				schematicName: ir.page?.schematicName,
				pageName: ir.page?.pageName,
			});
		}

		const page = await requireSchematicPage();
		const tabId = page.tabId;
		const docUuid = page.uuid;

		// 2) Load persistent map and apply clear/delete patches
		let map = loadSchematicMap(docUuid);

		const cleared =
			ir.page?.clear && (ir.page.clearMode ?? 'mcp') === 'all'
				? await clearCurrentSchematicPage()
				: ir.page?.clear
					? await clearManagedPrimitives(map)
					: undefined;
		if (ir.page?.clear) {
			map = createEmptySchematicMap();
		}

		const deleted: Record<string, Array<string>> = {};

		const deleteIds = ir.patch?.delete;
		if (deleteIds) {
			const deleteComponents = async (ids: Array<string> | undefined, kind: keyof typeof map) => {
				if (!ids?.length) return;
				for (const id of ids) {
					const entry = (map as any)[kind]?.[id] as { primitiveId: string } | undefined;
					if (!entry) continue;
					try {
						if (kind === 'texts') await eda.sch_PrimitiveText.delete(entry.primitiveId);
						else if (kind === 'wires' || kind === 'connections') await eda.sch_PrimitiveWire.delete(entry.primitiveId);
						else await (eda.sch_PrimitiveComponent as any).delete(entry.primitiveId);
					} catch {
						// ignore
					}
					delete (map as any)[kind][id];
					(deleted[kind] ||= []).push(id);
				}
			};

			await deleteComponents(deleteIds.components, 'components');
			await deleteComponents(deleteIds.netFlags, 'netFlags');
			await deleteComponents(deleteIds.netPorts, 'netPorts');
			await deleteComponents(deleteIds.texts, 'texts');
			await deleteComponents(deleteIds.wires, 'wires');
			await deleteComponents(deleteIds.connections, 'connections');
		}

		// 3) Upsert primitives (incremental by default)
		const applied = {
			components: {} as Record<string, { primitiveId: string; action: 'created' | 'updated' | 'replaced' }>,
			netFlags: {} as Record<string, { primitiveId: string; action: 'created' | 'updated' | 'replaced' }>,
			netPorts: {} as Record<string, { primitiveId: string; action: 'created' | 'updated' | 'replaced' }>,
			texts: {} as Record<string, { primitiveId: string; action: 'created' | 'updated' | 'replaced' }>,
			wires: {} as Record<string, { primitiveId: string; action: 'created' | 'updated' | 'replaced' }>,
			connections: {} as Record<string, { primitiveId: string; action: 'created' | 'updated' | 'replaced' }>,
		};

		const deleteCount =
			(deleteIds?.components?.length ?? 0) +
			(deleteIds?.netFlags?.length ?? 0) +
			(deleteIds?.netPorts?.length ?? 0) +
			(deleteIds?.texts?.length ?? 0) +
			(deleteIds?.wires?.length ?? 0) +
			(deleteIds?.connections?.length ?? 0);

		const totalSteps =
			deleteCount +
			ir.components.length +
			ir.netFlags.length +
			ir.netPorts.length +
			ir.texts.length +
			ir.wires.length +
			ir.connections.length +
			(ir.post?.drc ? 1 : 0) +
			(ir.post?.save ? 1 : 0) +
			(ir.post?.capturePng ? 1 : 0);
		let doneSteps = 0;
		const bump = () => {
			doneSteps += 1;
			if (!totalSteps) return;
			const pct = Math.min(99, Math.floor((doneSteps / totalSteps) * 100));
			eda.sys_LoadingAndProgressBar.showProgressBar(pct, 'MCP: Applying schematic');
		};

		// Components (upsert)
		for (const c of ir.components) {
			const ref = await resolveDeviceRef(c.deviceUuid, c.libraryUuid);

			const existing = map.components[c.id];
			const desiredMeta = { deviceUuid: c.deviceUuid, libraryUuid: ref.libraryUuid };

			const x = toSchUnits(c.x, units);
			const y = toSchUnits(c.y, units);

			const updateExisting = async (): Promise<boolean> => {
				if (!existing) return false;
				if (existing.deviceUuid !== desiredMeta.deviceUuid || existing.libraryUuid !== desiredMeta.libraryUuid) return false;
				try {
					const updated = await (eda.sch_PrimitiveComponent as any).modify(existing.primitiveId, {
						x,
						y,
						rotation: c.rotation,
						mirror: c.mirror,
						addIntoBom: c.addIntoBom,
						addIntoPcb: c.addIntoPcb,
						designator: c.designator,
						name: c.name,
						otherProperty: {
							__mcp_id: c.id,
							__mcp_deviceUuid: desiredMeta.deviceUuid,
							__mcp_libraryUuid: desiredMeta.libraryUuid,
						},
					});
					return Boolean(updated);
				} catch {
					return false;
				}
			};

			const updated = await updateExisting();
			if (updated && existing) {
				applied.components[c.id] = { primitiveId: existing.primitiveId, action: 'updated' };
				bump();
				continue;
			}

			// replace/create
			if (existing) {
				try {
					await (eda.sch_PrimitiveComponent as any).delete(existing.primitiveId);
				} catch {
					// ignore
				}
			}

			const primitive = await (eda.sch_PrimitiveComponent as any).create(
				ref,
				x,
				y,
				c.subPartName,
				c.rotation,
				c.mirror,
				c.addIntoBom,
				c.addIntoPcb,
			);
			if (!primitive) throw rpcError('PLACE_FAILED', `Failed to place device for component ${c.id}`);

			const primitiveId: string = primitive.getState_PrimitiveId();

			// Set metadata + display fields
			try {
				await (eda.sch_PrimitiveComponent as any).modify(primitiveId, {
					designator: c.designator,
					name: c.name,
					otherProperty: {
						__mcp_id: c.id,
						__mcp_deviceUuid: desiredMeta.deviceUuid,
						__mcp_libraryUuid: desiredMeta.libraryUuid,
					},
				});
			} catch {
				// ignore
			}

			map.components[c.id] = { primitiveId, ...desiredMeta };
			applied.components[c.id] = { primitiveId, action: existing ? 'replaced' : 'created' };

			bump();
		}

		// Net flags (upsert)
		for (const nf of ir.netFlags) {
			const x = toSchUnits(nf.x, units);
			const y = toSchUnits(nf.y, units);

			const existing = map.netFlags[nf.id];
			const shouldReplace = existing && existing.identification !== nf.identification;

			if (existing && !shouldReplace) {
				const ok = await updateComponentPrimitiveInPlace(existing.primitiveId, {
					x,
					y,
					rotation: nf.rotation,
					mirror: nf.mirror,
					net: nf.net,
					otherProperty: { __mcp_id: nf.id, __mcp_type: 'netFlag' },
				});
				if (ok) {
					map.netFlags[nf.id] = { primitiveId: existing.primitiveId, identification: nf.identification, net: nf.net };
					applied.netFlags[nf.id] = { primitiveId: existing.primitiveId, action: 'updated' };
					bump();
					continue;
				}
			}

			if (existing) {
				try {
					await (eda.sch_PrimitiveComponent as any).delete(existing.primitiveId);
				} catch {
					// ignore
				}
			}

			const primitive = await (eda.sch_PrimitiveComponent as any).createNetFlag(
				nf.identification,
				nf.net,
				x,
				y,
				nf.rotation,
				nf.mirror,
			);
			if (!primitive) throw rpcError('PLACE_FAILED', `Failed to create net flag ${nf.id}`);
			const primitiveId = primitive.getState_PrimitiveId();
			map.netFlags[nf.id] = { primitiveId, identification: nf.identification, net: nf.net };
			applied.netFlags[nf.id] = { primitiveId, action: existing ? 'replaced' : 'created' };
			bump();
		}

		// Net ports (upsert)
		for (const np of ir.netPorts) {
			const x = toSchUnits(np.x, units);
			const y = toSchUnits(np.y, units);

			const existing = map.netPorts[np.id];
			const shouldReplace = existing && existing.direction !== np.direction;

			if (existing && !shouldReplace) {
				const ok = await updateComponentPrimitiveInPlace(existing.primitiveId, {
					x,
					y,
					rotation: np.rotation,
					mirror: np.mirror,
					net: np.net,
					otherProperty: { __mcp_id: np.id, __mcp_type: 'netPort' },
				});
				if (ok) {
					map.netPorts[np.id] = { primitiveId: existing.primitiveId, direction: np.direction, net: np.net };
					applied.netPorts[np.id] = { primitiveId: existing.primitiveId, action: 'updated' };
					bump();
					continue;
				}
			}

			if (existing) {
				try {
					await (eda.sch_PrimitiveComponent as any).delete(existing.primitiveId);
				} catch {
					// ignore
				}
			}

			const primitive = await (eda.sch_PrimitiveComponent as any).createNetPort(np.direction, np.net, x, y, np.rotation, np.mirror);
			if (!primitive) throw rpcError('PLACE_FAILED', `Failed to create net port ${np.id}`);
			const primitiveId = primitive.getState_PrimitiveId();
			map.netPorts[np.id] = { primitiveId, direction: np.direction, net: np.net };
			applied.netPorts[np.id] = { primitiveId, action: existing ? 'replaced' : 'created' };
			bump();
		}

		// Texts (upsert)
		for (const t of ir.texts) {
			const existing = map.texts[t.id];
			const x = toSchUnits(t.x, units);
			const y = toSchUnits(t.y, units);

			if (existing) {
				try {
					const updated = await eda.sch_PrimitiveText.modify(existing.primitiveId, {
						x,
						y,
						content: t.content,
						rotation: t.rotation,
						textColor: t.textColor ?? undefined,
						fontName: t.fontName ?? undefined,
						fontSize: t.fontSize ?? undefined,
						bold: t.bold,
						italic: t.italic,
						underLine: t.underLine,
						alignMode: t.alignMode,
					});
					if (updated) {
						applied.texts[t.id] = { primitiveId: existing.primitiveId, action: 'updated' };
						bump();
						continue;
					}
				} catch {
					// ignore
				}
			}

			if (existing) {
				try {
					await eda.sch_PrimitiveText.delete(existing.primitiveId);
				} catch {
					// ignore
				}
			}

			const primitive = await eda.sch_PrimitiveText.create(
				x,
				y,
				t.content,
				t.rotation,
				t.textColor ?? undefined,
				t.fontName ?? undefined,
				t.fontSize ?? undefined,
				t.bold,
				t.italic,
				t.underLine,
				t.alignMode,
			);
			if (!primitive) throw rpcError('CREATE_FAILED', `Failed to create text ${t.id}`);
			const primitiveId = primitive.getState_PrimitiveId();
			map.texts[t.id] = { primitiveId };
			applied.texts[t.id] = { primitiveId, action: existing ? 'replaced' : 'created' };
			bump();
		}

			// Wires (upsert)
			for (const w of ir.wires) {
				const existing = map.wires[w.id];
				const line = mapLine(w.line as any, units) as any;

				if (existing) {
					try {
						const property: any = { line };
						if (w.net !== undefined) property.net = w.net;
						const updated = await eda.sch_PrimitiveWire.modify(existing.primitiveId, property);
						if (updated) {
							applied.wires[w.id] = { primitiveId: existing.primitiveId, action: 'updated' };
							bump();
							continue;
					}
				} catch {
					// ignore
				}
			}

			if (existing) {
				try {
					await eda.sch_PrimitiveWire.delete(existing.primitiveId);
				} catch {
					// ignore
				}
				}

				const primitive =
					w.net !== undefined ? await eda.sch_PrimitiveWire.create(line, w.net) : await eda.sch_PrimitiveWire.create(line);
				if (!primitive) throw rpcError('CREATE_FAILED', `Failed to create wire ${w.id}`);
				const primitiveId = primitive.getState_PrimitiveId();
				map.wires[w.id] = { primitiveId };
				applied.wires[w.id] = { primitiveId, action: existing ? 'replaced' : 'created' };
			bump();
		}

		// Connections (auto wire, upsert)
		const pinsCache = new Map<string, Array<Pin>>();
		const getPins = async (componentId: string): Promise<Array<Pin>> => {
			const cached = pinsCache.get(componentId);
			if (cached) return cached;
			const entry = map.components[componentId];
			if (!entry) throw rpcError('INVALID_IR', `Unknown componentId: ${componentId}`);
			const pins = await (eda.sch_PrimitiveComponent as any).getAllPinsByPrimitiveId(entry.primitiveId);
			if (!pins) throw rpcError('PIN_NOT_FOUND', `Pins not found for component ${componentId}`);
			pinsCache.set(componentId, pins);
			return pins;
		};

		for (const conn of ir.connections) {
			const fromPins = await getPins(conn.from.componentId);
			const toPins = await getPins(conn.to.componentId);

			const fromPin = selectPin(fromPins, { pinNumber: conn.from.pinNumber, pinName: conn.from.pinName }, 'from');
			const toPin = selectPin(toPins, { pinNumber: conn.to.pinNumber, pinName: conn.to.pinName }, 'to');

			const x1 = fromPin.getState_X();
			const y1 = fromPin.getState_Y();
			const x2 = toPin.getState_X();
			const y2 = toPin.getState_Y();

			let line: Array<number>;
			if (conn.style === 'straight') {
				line = [x1, y1, x2, y2];
			} else {
				const midX = conn.midX !== undefined ? toSchUnits(conn.midX, units) : (x1 + x2) / 2;
				line = [x1, y1, midX, y1, midX, y2, x2, y2];
			}

				const existing = map.connections[conn.id];
				if (existing) {
					try {
						const property: any = { line };
						if (conn.net !== undefined) property.net = conn.net;
						const updated = await eda.sch_PrimitiveWire.modify(existing.primitiveId, property);
						if (updated) {
							applied.connections[conn.id] = { primitiveId: existing.primitiveId, action: 'updated' };
							bump();
							continue;
					}
				} catch {
					// ignore
				}
			}

			if (existing) {
				try {
					await eda.sch_PrimitiveWire.delete(existing.primitiveId);
				} catch {
					// ignore
				}
				}

				const wire =
					conn.net !== undefined ? await eda.sch_PrimitiveWire.create(line, conn.net) : await eda.sch_PrimitiveWire.create(line);
				if (!wire) throw rpcError('WIRE_CREATE_FAILED', `Failed to create connection wire ${conn.id}`);
				const primitiveId = wire.getState_PrimitiveId();
				map.connections[conn.id] = { primitiveId };
				applied.connections[conn.id] = { primitiveId, action: existing ? 'replaced' : 'created' };
			bump();
		}

		// Persist updated map (after all mutations)
		await saveSchematicMap(docUuid, map);

		// 4) Post steps
		if (ir.post?.zoomToAll ?? false) {
			await eda.dmt_EditorControl.zoomToAllPrimitives(tabId);
		}

		const drcResult = ir.post?.drc
			? await eda.sch_Drc.check(ir.post.drc.strict ?? false, ir.post.drc.userInterface ?? false)
			: undefined;
		if (ir.post?.drc) bump();

		const saveResult = ir.post?.save ? await eda.sch_Document.save() : undefined;
		if (ir.post?.save) bump();

		const captureResult = ir.post?.capturePng
			? await captureRenderedAreaImage({
					tabId,
					zoomToAll: false,
					savePath: ir.post.capturePng.savePath,
					fileName: safeFileName(ir.post.capturePng.fileName || `jlceda_mcp_schematic_${safeFileName(new Date().toISOString())}.png`),
					force: ir.post.capturePng.force,
				})
			: undefined;
		if (ir.post?.capturePng) bump();

		eda.sys_LoadingAndProgressBar.showProgressBar(100, 'MCP: Applying schematic');

		return {
			ok: true,
			page,
			units: units,
			cleared,
			deleted: Object.keys(deleted).length ? deleted : undefined,
			applied,
			post: {
				drc: ir.post?.drc ? { ok: drcResult } : undefined,
				save: ir.post?.save ? { ok: saveResult } : undefined,
				capturePng: captureResult,
			},
		};
	} finally {
		try {
			eda.sys_LoadingAndProgressBar.destroyProgressBar();
		} catch {
			// ignore
		}
	}
}

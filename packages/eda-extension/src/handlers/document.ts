import { asObject, asOptionalBoolean, asOptionalNumber, asOptionalString, endsWithPathSeparator, rpcError, safeFileName } from '../bridge/validate';

type CurrentDocInfo = {
	documentType: number;
	uuid: string;
	tabId: string;
	parentProjectUuid?: string;
	parentLibraryUuid?: string;
};

function getTimestampForFileName(): string {
	return safeFileName(new Date().toISOString());
}

function joinPath(folderOrFile: string, fileName: string): string {
	if (endsWithPathSeparator(folderOrFile)) return `${folderOrFile}${fileName}`;
	return folderOrFile;
}

export async function getCurrentDocumentInfo(): Promise<CurrentDocInfo | undefined> {
	return (await eda.dmt_SelectControl.getCurrentDocumentInfo()) as any;
}

export async function ensureSchematicPage(params: unknown): Promise<CurrentDocInfo> {
	const input = params ? asObject(params, 'params') : {};
	const boardName = asOptionalString(input.boardName, 'boardName');
	const schematicName = asOptionalString(input.schematicName, 'schematicName');
	const pageName = asOptionalString(input.pageName, 'pageName');

	const current = await eda.dmt_SelectControl.getCurrentDocumentInfo();
	if (current?.documentType === 1 /* SCHEMATIC_PAGE */) return current as any;

	const schematicUuid = await eda.dmt_Schematic.createSchematic(boardName);
	if (!schematicUuid) throw rpcError('CREATE_SCHEMATIC_FAILED', 'Failed to create schematic');

	if (schematicName) {
		await eda.dmt_Schematic.modifySchematicName(schematicUuid, schematicName);
	}

	const pageUuid = await eda.dmt_Schematic.createSchematicPage(schematicUuid);
	if (!pageUuid) throw rpcError('CREATE_SCHEMATIC_PAGE_FAILED', 'Failed to create schematic page');

	if (pageName) {
		await eda.dmt_Schematic.modifySchematicPageName(pageUuid, pageName);
	}

	const tabId = await eda.dmt_EditorControl.openDocument(pageUuid);
	if (!tabId) throw rpcError('OPEN_DOCUMENT_FAILED', 'Failed to open schematic page in editor');

	await eda.dmt_EditorControl.activateDocument(tabId);

	return {
		documentType: 1,
		uuid: pageUuid,
		tabId,
		parentProjectUuid: undefined,
		parentLibraryUuid: undefined,
	};
}

export async function captureRenderedAreaImage(params: unknown): Promise<{ savedTo?: string; fileName: string; downloadTriggered?: boolean }> {
	const input = params ? asObject(params, 'params') : {};
	const tabId = asOptionalString(input.tabId, 'tabId');
	const zoomToAll = asOptionalBoolean(input.zoomToAll, 'zoomToAll') ?? true;
	const savePath = asOptionalString(input.savePath, 'savePath');
	const fileNameInput = asOptionalString(input.fileName, 'fileName');
	const force = asOptionalBoolean(input.force, 'force') ?? true;

	const current = await eda.dmt_SelectControl.getCurrentDocumentInfo();
	const resolvedTabId = tabId ?? current?.tabId;
	if (!resolvedTabId) throw rpcError('NO_ACTIVE_DOCUMENT', 'No active document to capture');

	if (zoomToAll) {
		await eda.dmt_EditorControl.zoomToAllPrimitives(resolvedTabId);
	}

	const image = await eda.dmt_EditorControl.getCurrentRenderedAreaImage(resolvedTabId);
	if (!image) throw rpcError('CAPTURE_FAILED', 'Failed to capture rendered area image');

	const fileName = safeFileName(fileNameInput || `jlceda_mcp_capture_${getTimestampForFileName()}.png`);

	let resolvedSavePath = savePath;
	if (!resolvedSavePath) {
		try {
			const edaPath = await eda.sys_FileSystem.getEdaPath();
			resolvedSavePath = endsWithPathSeparator(edaPath) ? edaPath : `${edaPath}\\`;
		} catch {
			// no permission: fallback to saveFile below
		}
	}

	if (resolvedSavePath) {
		const ok = await eda.sys_FileSystem.saveFileToFileSystem(resolvedSavePath, image, fileName, force);
		if (!ok) throw rpcError('SAVE_FILE_FAILED', 'Failed to save image to file system');
		return { savedTo: joinPath(resolvedSavePath, fileName), fileName };
	}

	await eda.sys_FileSystem.saveFile(image, fileName);
	return { fileName, downloadTriggered: true };
}

export async function exportDocumentFile(params: unknown): Promise<{ savedTo?: string; fileName: string; fileType: string; downloadTriggered?: boolean }> {
	const input = params ? asObject(params, 'params') : {};
	const fileType = asOptionalString(input.fileType, 'fileType') ?? '.epro2';
	const password = asOptionalString(input.password, 'password');
	const savePath = asOptionalString(input.savePath, 'savePath');
	const fileNameInput = asOptionalString(input.fileName, 'fileName');
	const force = asOptionalBoolean(input.force, 'force') ?? true;

	const current = await eda.dmt_SelectControl.getCurrentDocumentInfo();
	const baseName = current?.uuid ? `jlceda_mcp_document_${current.uuid}` : `jlceda_mcp_document_${getTimestampForFileName()}`;
	const fileName = safeFileName(fileNameInput || `${baseName}${fileType}`);

	const file = await eda.sys_FileManager.getDocumentFile(fileName, password, fileType as any);
	if (!file) throw rpcError('EXPORT_FAILED', 'Failed to get document file (no doc open or missing permissions)');

	let resolvedSavePath = savePath;
	if (!resolvedSavePath) {
		try {
			const edaPath = await eda.sys_FileSystem.getEdaPath();
			resolvedSavePath = endsWithPathSeparator(edaPath) ? edaPath : `${edaPath}\\`;
		} catch {
			// fallback to saveFile below
		}
	}

	if (resolvedSavePath) {
		const ok = await eda.sys_FileSystem.saveFileToFileSystem(resolvedSavePath, file, fileName, force);
		if (!ok) throw rpcError('SAVE_FILE_FAILED', 'Failed to save document file to file system');
		return { savedTo: joinPath(resolvedSavePath, fileName), fileName, fileType };
	}

	await eda.sys_FileSystem.saveFile(file, fileName);
	return { fileName, fileType, downloadTriggered: true };
}

export async function getDocumentSource(params: unknown): Promise<{ source?: string; truncated: boolean; totalChars: number }> {
	const input = params ? asObject(params, 'params') : {};
	const maxChars = asOptionalNumber(input.maxChars, 'maxChars') ?? 200_000;

	const source = await eda.sys_FileManager.getDocumentSource();
	if (source === undefined) return { source: undefined, truncated: false, totalChars: 0 };

	if (source.length <= maxChars) return { source, truncated: false, totalChars: source.length };
	return { source: source.slice(0, maxChars), truncated: true, totalChars: source.length };
}


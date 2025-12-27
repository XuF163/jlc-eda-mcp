type RpcError = { code: string; message: string; data?: unknown };

export function rpcError(code: string, message: string, data?: unknown): RpcError {
	return { code, message, data };
}

export function asString(value: unknown, fieldName: string): string {
	if (typeof value !== 'string') {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a string`);
	}
	return value;
}

export function asOptionalString(value: unknown, fieldName: string): string | undefined {
	if (value === undefined) return undefined;
	if (value === null) return undefined;
	if (typeof value !== 'string') {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a string`);
	}
	return value;
}

export function asNumber(value: unknown, fieldName: string): number {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a number`);
	}
	return value;
}

export function asOptionalNumber(value: unknown, fieldName: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'number' || Number.isNaN(value)) {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a number`);
	}
	return value;
}

export function asOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'boolean') {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a boolean`);
	}
	return value;
}

export function asObject(value: unknown, fieldName: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be an object`);
	}
	return value as Record<string, unknown>;
}

export function endsWithPathSeparator(path: string): boolean {
	return path.endsWith('/') || path.endsWith('\\');
}

export function safeFileName(value: string): string {
	// Windows filename restrictions: \ / : * ? " < > |
	return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}


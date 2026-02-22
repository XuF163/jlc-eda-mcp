type RpcError = { code: string; message: string; data?: unknown };

export function rpcError(code: string, message: string, data?: unknown): RpcError {
	return { code, message, data };
}

export function isUuid32(value: string): boolean {
	return typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value.trim());
}

export function asString(value: unknown, fieldName: string): string {
	if (typeof value !== 'string') {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a string`);
	}
	return value;
}

export function asUuid32(value: unknown, fieldName: string): string {
	const s = asString(value, fieldName);
	if (!isUuid32(s)) {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a 32-char hex UUID`);
	}
	return s.trim();
}

export function asOptionalString(value: unknown, fieldName: string): string | undefined {
	if (value === undefined) return undefined;
	if (value === null) return undefined;
	if (typeof value !== 'string') {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a string`);
	}
	return value;
}

export function asOptionalUuid32(value: unknown, fieldName: string): string | undefined {
	const s = asOptionalString(value, fieldName);
	if (s === undefined) return undefined;
	if (!isUuid32(s)) {
		throw rpcError('INVALID_PARAMS', `Expected ${fieldName} to be a 32-char hex UUID`);
	}
	return s.trim();
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

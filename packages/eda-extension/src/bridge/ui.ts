export function showInfo(message: string): void {
	eda.sys_Dialog.showInformationMessage(message, 'MCP Bridge');
}

export function showToast(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info', timerSeconds = 3): void {
	try {
		(eda as any).sys_Message?.showToastMessage?.(message, type, timerSeconds);
	} catch {
		// Fallback to modal if toast is unavailable in this environment.
		showInfo(message);
	}
}

export function inputText(
	title: string,
	beforeContent: string,
	value?: string,
	opts?: { type?: 'text' | 'password' | 'url'; afterContent?: string; placeholder?: string },
): Promise<string | undefined> {
	return new Promise((resolve) => {
		eda.sys_Dialog.showInputDialog(
			beforeContent,
			opts?.afterContent,
			title,
			opts?.type ?? 'text',
			value ?? '',
			opts?.placeholder ? { placeholder: opts.placeholder } : undefined,
			(v: unknown) => {
				if (v === undefined || v === null) {
					resolve(undefined);
					return;
				}
				resolve(String(v));
			},
		);
	});
}

export function selectOne(
	title: string,
	beforeContent: string,
	options: Array<{ value: string; displayContent: string }>,
	defaultOption?: string,
): Promise<string | undefined> {
	return new Promise((resolve) => {
		eda.sys_Dialog.showSelectDialog(options as any, beforeContent, undefined, title, defaultOption, false, (v: any) => {
			if (v === undefined || v === null) {
				resolve(undefined);
				return;
			}
			resolve(String(v));
		});
	});
}

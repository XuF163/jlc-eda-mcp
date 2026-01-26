import fs from 'node:fs/promises';

function assertString(value, name) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing/invalid ${name}`);
	return value;
}

async function readJson(path) {
	const raw = await fs.readFile(path, 'utf8');
	return JSON.parse(raw);
}

async function replaceVersionInJsonFile(path, nextVersion) {
	const raw = await fs.readFile(path, 'utf8');

	if (/"version"\s*:/.test(raw)) {
		const next = raw.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${nextVersion}"`);
		if (next !== raw) await fs.writeFile(path, next, 'utf8');
		return;
	}

	// Fallback: insert after "private" if present, otherwise after "name".
	const insertAfter = raw.includes('"private"') ? '"private"' : '"name"';
	const lines = raw.split(/\r?\n/);
	const i = lines.findIndex((l) => l.includes(insertAfter));
	if (i === -1) throw new Error(`Could not find insertion point in ${path}`);
	lines.splice(i + 1, 0, `\t"version": "${nextVersion}",`);
	await fs.writeFile(path, lines.join('\n'), 'utf8');
}

const rootPkgPath = new URL('../package.json', import.meta.url);
const mcpPkgPath = new URL('../packages/mcp-server/package.json', import.meta.url);

const mcpPkg = await readJson(mcpPkgPath);
const mcpVersion = assertString(mcpPkg.version, 'packages/mcp-server package.json version');

await replaceVersionInJsonFile(rootPkgPath, mcpVersion);
process.stdout.write(`Synced root package.json version -> ${mcpVersion}\n`);

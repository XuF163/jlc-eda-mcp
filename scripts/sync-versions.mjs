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
const edaExtManifestPath = new URL('../packages/eda-extension/extension.json', import.meta.url);
const edaExtPkgPath = new URL('../packages/eda-extension/package.json', import.meta.url);

const rootPkg = await readJson(rootPkgPath);
const rootVersion = assertString(rootPkg.version, 'root package.json version');

await replaceVersionInJsonFile(mcpPkgPath, rootVersion);
process.stdout.write(`Synced packages/mcp-server/package.json version -> ${rootVersion}\n`);

await replaceVersionInJsonFile(edaExtManifestPath, rootVersion);
process.stdout.write(`Synced packages/eda-extension/extension.json version -> ${rootVersion}\n`);

await replaceVersionInJsonFile(edaExtPkgPath, rootVersion);
process.stdout.write(`Synced packages/eda-extension/package.json version -> ${rootVersion}\n`);

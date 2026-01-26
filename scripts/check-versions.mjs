import fs from 'node:fs/promises';

function assertString(value, name) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing/invalid ${name}`);
	return value;
}

async function readJson(path) {
	const raw = await fs.readFile(path, 'utf8');
	return JSON.parse(raw);
}

const rootPkgPath = new URL('../package.json', import.meta.url);
const mcpPkgPath = new URL('../packages/mcp-server/package.json', import.meta.url);

const rootPkg = await readJson(rootPkgPath);
const mcpPkg = await readJson(mcpPkgPath);

const rootVersion = assertString(rootPkg.version, 'root package.json version');
const mcpVersion = assertString(mcpPkg.version, 'packages/mcp-server package.json version');

if (rootVersion !== mcpVersion) {
	process.stderr.write(
		`Version mismatch:\n- package.json: ${rootVersion}\n- packages/mcp-server/package.json: ${mcpVersion}\n`,
	);
	process.stderr.write('Fix: run `npm run version:sync` from repo root.\n');
	process.exit(1);
}

process.stdout.write(`OK: versions match (${rootVersion}).\n`);

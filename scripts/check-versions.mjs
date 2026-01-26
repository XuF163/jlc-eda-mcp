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
const edaExtManifestPath = new URL('../packages/eda-extension/extension.json', import.meta.url);
const edaExtPkgPath = new URL('../packages/eda-extension/package.json', import.meta.url);

const rootPkg = await readJson(rootPkgPath);
const mcpPkg = await readJson(mcpPkgPath);
const edaExtManifest = await readJson(edaExtManifestPath);
const edaExtPkg = await readJson(edaExtPkgPath);

const rootVersion = assertString(rootPkg.version, 'root package.json version');
const mcpVersion = assertString(mcpPkg.version, 'packages/mcp-server package.json version');
const edaExtVersion = assertString(edaExtManifest.version, 'packages/eda-extension/extension.json version');
const edaExtPkgVersion = assertString(edaExtPkg.version, 'packages/eda-extension/package.json version');

const mismatches = [];
if (rootVersion !== mcpVersion) mismatches.push(`- package.json: ${rootVersion}\n- packages/mcp-server/package.json: ${mcpVersion}`);
if (rootVersion !== edaExtVersion)
	mismatches.push(`- package.json: ${rootVersion}\n- packages/eda-extension/extension.json: ${edaExtVersion}`);
if (rootVersion !== edaExtPkgVersion)
	mismatches.push(`- package.json: ${rootVersion}\n- packages/eda-extension/package.json: ${edaExtPkgVersion}`);

if (mismatches.length) {
	process.stderr.write(
		`Version mismatch:\n${mismatches.join('\n')}\n`,
	);
	process.stderr.write('Fix: run `npm run version:sync` from repo root.\n');
	process.exit(1);
}

process.stdout.write(`OK: versions match (${rootVersion}).\n`);

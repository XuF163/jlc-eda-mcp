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
const lockPath = new URL('../package-lock.json', import.meta.url);
const mcpPkgPath = new URL('../packages/mcp-server/package.json', import.meta.url);
const edaExtManifestPath = new URL('../packages/eda-extension/extension.json', import.meta.url);
const edaExtPkgPath = new URL('../packages/eda-extension/package.json', import.meta.url);

const rootPkg = await readJson(rootPkgPath);
let lock;
try {
	lock = await readJson(lockPath);
} catch (err) {
	// package-lock.json is optional in some workflows
	if (!(err && (err.code === 'ENOENT' || err.code === 'ENOTDIR'))) throw err;
	lock = undefined;
}
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

if (lock) {
	const lockVersion = typeof lock.version === 'string' ? lock.version : undefined;
	const rootLockVersion = lock?.packages?.['']?.version;
	const mcpLockVersion = lock?.packages?.['packages/mcp-server']?.version;
	const edaExtLockVersion = lock?.packages?.['packages/eda-extension']?.version;

	if (lockVersion && rootVersion !== lockVersion) mismatches.push(`- package.json: ${rootVersion}\n- package-lock.json: ${lockVersion}`);
	if (typeof rootLockVersion === 'string' && rootVersion !== rootLockVersion) {
		mismatches.push(`- package.json: ${rootVersion}\n- package-lock.json(packages[\"\"]): ${rootLockVersion}`);
	}
	if (typeof mcpLockVersion === 'string' && rootVersion !== mcpLockVersion) {
		mismatches.push(`- package.json: ${rootVersion}\n- package-lock.json(packages[\"packages/mcp-server\"]): ${mcpLockVersion}`);
	}
	if (typeof edaExtLockVersion === 'string' && rootVersion !== edaExtLockVersion) {
		mismatches.push(
			`- package.json: ${rootVersion}\n- package-lock.json(packages[\"packages/eda-extension\"]): ${edaExtLockVersion}`,
		);
	}
}

if (mismatches.length) {
	process.stderr.write(
		`Version mismatch:\n${mismatches.join('\n')}\n`,
	);
	process.stderr.write('Fix: run `npm run version:sync` from repo root.\n');
	process.exit(1);
}

process.stdout.write(`OK: versions match (${rootVersion}).\n`);

import fs from 'node:fs/promises';

function assertString(value, name) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing/invalid ${name}`);
	return value;
}

async function readJson(path) {
	const raw = await fs.readFile(path, 'utf8');
	return JSON.parse(raw);
}

async function writeJsonPreserveStyle(path, value, originalRaw) {
	const eol = originalRaw.includes('\r\n') ? '\r\n' : '\n';
	let nextRaw = JSON.stringify(value, null, '\t') + '\n';
	if (eol === '\r\n') nextRaw = nextRaw.replace(/\n/g, '\r\n');
	if (nextRaw !== originalRaw) await fs.writeFile(path, nextRaw, 'utf8');
}

const rootPkgPath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);

const rootPkg = await readJson(rootPkgPath);
const rootVersion = assertString(rootPkg.version, 'root package.json version');

let lockRaw;
try {
	lockRaw = await fs.readFile(lockPath, 'utf8');
} catch (err) {
	// package-lock.json is optional in some workflows
	if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
		process.stdout.write('Skipped: package-lock.json not found.\n');
		process.exit(0);
	}
	throw err;
}

const lock = JSON.parse(lockRaw);

// npm lockfile fields (keep them consistent with root version)
lock.version = rootVersion;
if (lock.packages && lock.packages['']) {
	lock.packages[''].version = rootVersion;
}
if (lock.packages && lock.packages['packages/mcp-server']) {
	lock.packages['packages/mcp-server'].version = rootVersion;
}
if (lock.packages && lock.packages['packages/eda-extension']) {
	lock.packages['packages/eda-extension'].version = rootVersion;
}

await writeJsonPreserveStyle(lockPath, lock, lockRaw);
process.stdout.write(`Synced package-lock.json versions -> ${rootVersion}\n`);


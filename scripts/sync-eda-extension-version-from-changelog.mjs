import fs from 'node:fs/promises';

function assertString(value, name) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing/invalid ${name}`);
	return value;
}

function parseLatestVersionFromChangelog(raw) {
	// Expect newest version section to appear first (descending order), e.g.:
	// ## 0.0.13 - 2026-02-22
	// Also accept `v0.0.13`.
	const match = raw.match(/^##\s+v?(\d+\.\d+\.\d+)\b/m);
	return match?.[1];
}

async function replaceVersionInJsonFile(path, nextVersion) {
	const raw = await fs.readFile(path, 'utf8');

	if (/"version"\s*:/.test(raw)) {
		const next = raw.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${nextVersion}"`);
		if (next !== raw) await fs.writeFile(path, next, 'utf8');
		return next !== raw;
	}

	// Fallback: insert after "private" if present, otherwise after "name".
	const insertAfter = raw.includes('"private"') ? '"private"' : '"name"';
	const eol = raw.includes('\r\n') ? '\r\n' : '\n';
	const lines = raw.split(/\r?\n/);
	const i = lines.findIndex((l) => l.includes(insertAfter));
	if (i === -1) throw new Error(`Could not find insertion point in ${path}`);
	lines.splice(i + 1, 0, `\t"version": "${nextVersion}",`);
	await fs.writeFile(path, lines.join(eol), 'utf8');
	return true;
}

const changelogPath = new URL('../packages/eda-extension/CHANGELOG.md', import.meta.url);
const pkgPath = new URL('../packages/eda-extension/package.json', import.meta.url);
const manifestPath = new URL('../packages/eda-extension/extension.json', import.meta.url);

const changelogRaw = await fs.readFile(changelogPath, 'utf8');
const nextVersion = assertString(parseLatestVersionFromChangelog(changelogRaw), 'version in CHANGELOG.md');

const changedPkg = await replaceVersionInJsonFile(pkgPath, nextVersion);
const changedManifest = await replaceVersionInJsonFile(manifestPath, nextVersion);

if (changedPkg) process.stdout.write(`Synced packages/eda-extension/package.json version <- CHANGELOG.md (${nextVersion})\n`);
else process.stdout.write(`OK: packages/eda-extension/package.json already matches CHANGELOG.md (${nextVersion})\n`);

if (changedManifest) process.stdout.write(`Synced packages/eda-extension/extension.json version <- CHANGELOG.md (${nextVersion})\n`);
else process.stdout.write(`OK: packages/eda-extension/extension.json already matches CHANGELOG.md (${nextVersion})\n`);

import fs from 'fs-extra';
import ignore from 'ignore';
import JSZip from 'jszip';

import * as extensionConfig from '../extension.json';

function multiLineStrToArray(str: string): Array<string> {
	return str.split(/[\r\n]+/);
}

function testUuid(uuid?: string): uuid is string {
	const regExp = /^[a-z0-9]{32}$/g;
	if (uuid && uuid !== '00000000000000000000000000000000') {
		return regExp.test(uuid.trim());
	}
	return false;
}

function fixUuid(uuid?: string): string {
	uuid = uuid?.trim() || undefined;
	if (testUuid(uuid)) return uuid.trim();
	return crypto.randomUUID().replaceAll('-', '');
}

function main() {
	if (!testUuid(extensionConfig.uuid)) {
		const newExtensionConfig = { ...extensionConfig };
		// @ts-ignore
		delete newExtensionConfig.default;
		newExtensionConfig.uuid = fixUuid(extensionConfig.uuid);
		fs.writeJsonSync(__dirname + '/../extension.json', newExtensionConfig, { spaces: '\t', EOL: '\n', encoding: 'utf-8' });
	}

	const filepathListWithoutFilter = fs.readdirSync(__dirname + '/../', { encoding: 'utf-8', recursive: true });
	const edaignoreListWithoutResolve = multiLineStrToArray(fs.readFileSync(__dirname + '/../.edaignore', { encoding: 'utf-8' }));

	const edaignoreList: Array<string> = [];
	for (const line of edaignoreListWithoutResolve) {
		if (line.endsWith('/') || line.endsWith('\\')) {
			edaignoreList.push(line.slice(0, line.length - 1));
		} else {
			edaignoreList.push(line);
		}
	}

	const edaignore = ignore().add(edaignoreList);
	const filepathListWithoutResolve = edaignore.filter(filepathListWithoutFilter);

	const fileList: Array<string> = [];
	for (const filepath of filepathListWithoutResolve) {
		if (fs.lstatSync(filepath).isFile()) {
			fileList.push(filepath.replace(/\\/g, '/'));
		}
	}

	const zip = new JSZip();
	for (const file of fileList) {
		zip.file(file, fs.createReadStream(__dirname + '/../' + file));
	}

	fs.ensureDirSync(__dirname + '/dist/');
	zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true }).pipe(
		fs.createWriteStream(__dirname + '/dist/' + extensionConfig.name + '_v' + extensionConfig.version + '.eext'),
	);
}

main();

import type esbuild from 'esbuild';

export default {
	entryPoints: {
		index: './src/index',
	},
	entryNames: '[name]',
	assetNames: '[name]',
	bundle: true,
	minify: false,
	loader: {},
	outdir: './dist/',
	sourcemap: undefined,
	platform: 'browser',
	format: 'iife',
	globalName: 'edaEsbuildExportName',
	treeShaking: true,
	ignoreAnnotations: true,
	define: {},
	external: [],
} satisfies Parameters<(typeof esbuild)['build']>[0];


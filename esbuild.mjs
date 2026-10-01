import { readFile } from 'node:fs/promises';

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const tests = process.argv.includes('--tests');

/**
 * Prints errors in the format VS Code's $esbuild-watch problem matcher understands.
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        const target = build.initialOptions.outfile;
        build.onStart(() => {
            console.log(`[watch] build started (${target})`);
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log(`[watch] build finished (${target})`);
        });
    },
};

/**
 * mocha's browser build is a UMD script in a `"type": "module"` package, so esbuild inlines it as
 * ESM and its `module.exports = factory()` replaces the test bundle's exports. With `module`,
 * `exports` and `define` hidden it takes its global-only branch.
 * @type {import('esbuild').Plugin}
 */
const mochaBrowserBuildPlugin = {
    name: 'mocha-browser-build',

    setup(build) {
        build.onLoad({ filter: /[\\/]node_modules[\\/]mocha[\\/]mocha\.js$/ }, async ({ path }) => ({
            contents: `(function (module, exports, define) {\n${await readFile(path, 'utf8')}\n}).call(globalThis);`,
            loader: 'js',
        }));
    },
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
    entryPoints: ['src/extension/extension.ts'],
    bundle: true,
    format: 'cjs',
    sourcemap: true,
    sourcesContent: false,
    external: ['vscode'],
    logLevel: 'silent',
};

/**
 * One entry, two bundles. The browser bundle deliberately has no node-globals polyfill:
 * needing one means the source relies on node globals, which the web host does not have.
 */
const targets = [
    { ...shared, platform: 'node', outfile: 'out/extension.js' },
    { ...shared, platform: 'browser', outfile: 'out/web/extension.js', define: { global: 'globalThis' } },
];

/**
 * Integration tests, built only with `--tests` so `compile` stays lean.
 * Both hosts load a bundle exporting `run()`; the desktop runner itself is plain node.
 */
async function buildTests() {
    /** @type {import('esbuild').BuildOptions} */
    const base = {
        bundle: true,
        format: 'cjs',
        sourcemap: true,
        sourcesContent: false,
        logLevel: 'silent',
    };

    await Promise.all([
        esbuild.build({
            ...base,
            entryPoints: ['src/test/runIntegration.ts'],
            outfile: 'out/test/runIntegration.js',
            platform: 'node',
            external: ['vscode', '@vscode/test-electron'],
        }),
        esbuild.build({
            ...base,
            entryPoints: ['src/test/integration/desktopEntry.ts'],
            outfile: 'out/test/integration/index.js',
            platform: 'node',
            external: ['vscode'],
        }),
        esbuild.build({
            ...base,
            entryPoints: ['src/test/integration/webEntry.ts'],
            outfile: 'out/web/test/integration/index.js',
            platform: 'browser',
            external: ['vscode'],
            define: { global: 'globalThis' },
            plugins: [mochaBrowserBuildPlugin],
        }),
    ]);
}

async function main() {
    if (tests) {
        await buildTests();
        return;
    }

    const contexts = await Promise.all(
        targets.map(options => esbuild.context({ ...options, plugins: [esbuildProblemMatcherPlugin] }))
    );

    if (watch) {
        await Promise.all(contexts.map(ctx => ctx.watch()));
        return;
    }

    await Promise.all(contexts.map(ctx => ctx.rebuild()));
    await Promise.all(contexts.map(ctx => ctx.dispose()));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

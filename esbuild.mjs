import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

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

/** @type {import('esbuild').BuildOptions} */
const shared = {
    entryPoints: ['src/extension/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    external: ['vscode'],
    logLevel: 'silent',
};

/**
 * One entry, two bundles (MASTER_PLAN §14.2). The browser bundle deliberately has no
 * node-globals polyfill: needing one means §6.5 has been violated in the source.
 */
const targets = [
    { ...shared, platform: 'node', outfile: 'out/extension.js' },
    { ...shared, platform: 'browser', outfile: 'out/web/extension.js', define: { global: 'globalThis' } },
];

async function main() {
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

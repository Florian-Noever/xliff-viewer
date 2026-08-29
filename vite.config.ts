import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * Two HTML files, each with one job:
 *   media/webview.html — the host's template. Placeholders are filled in at runtime
 *                        (TOOL-05), following gob-numberingtool-vscode. `build.lib`
 *                        never processes HTML, so Vite does not touch it.
 *   index.html         — the Vite dev-server entry for `dev:webview`. No placeholders,
 *                        not shipped in the VSIX.
 */
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        },
    },
    // `public/` is our build output, not a static-asset source. Vite's publicDir defaults
    // to that same name and would otherwise try to copy the folder into itself.
    publicDir: false,
    build: {
        // One IIFE bundle, no code splitting: the webview CSP forbids dynamic imports (§11.1).
        lib: {
            entry: fileURLToPath(new URL('./src/webview/main.ts', import.meta.url)),
            formats: ['iife'],
            name: 'XliffViewerWebview',
            fileName: () => 'app.js',
        },
        outDir: 'public',
        emptyOutDir: false,
        cssCodeSplit: false,
        assetsInlineLimit: 8192,
        sourcemap: false,
        rollupOptions: {
            output: {
                assetFileNames: (info) => {
                    const name = info.names?.[0] ?? '';
                    return name.endsWith('.css') ? 'styles.css' : (name || '[name][extname]');
                },
            },
        },
    },
});

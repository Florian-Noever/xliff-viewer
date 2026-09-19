import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * Two HTML files, each with one job:
 *   media/webview.html — the host's template. Placeholders are filled in at runtime.
 *                        `build.lib` never processes HTML, so Vite does not touch it.
 *   index.html         — the Vite dev-server entry for `dev:webview`. No placeholders,
 *                        not shipped in the VSIX.
 */
export default defineConfig(({ mode }) => ({
    plugins: [vue()],
    // Vue's bundler build reads process.env.NODE_ENV, which does not exist in a webview.
    // Dev and Vitest define it already, so only the built bundle would throw without this.
    define: {
        'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
    },
    resolve: {
        alias: {
            '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        },
    },
    // `public/` is our build output, not a static-asset source. Vite's publicDir defaults
    // to that same name and would otherwise try to copy the folder into itself.
    publicDir: false,
    build: {
        // One IIFE bundle, no code splitting: the webview CSP forbids dynamic imports.
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
}));

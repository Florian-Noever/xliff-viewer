import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * `index.html` is the extension's webview shell: a static template whose placeholders
 * are filled in at runtime by the host (TOOL-05). `build.lib` does not process HTML at
 * all, so the file is never touched by the production build — but the dev server does
 * serve it, and would choke on the placeholders. This rewrites them for dev only.
 */
const devHtmlShell: Plugin = {
    name: 'xliff-viewer-dev-html-shell',
    apply: 'serve',
    transformIndexHtml(html) {
        return html
            .replace(/^.*Content-Security-Policy.*$\n?/m, '')
            .replace(/^.*%STYLE_URI%.*$\n?/m, '')
            .replace(
                /<script[^>]*%APP_URI%[^>]*><\/script>/,
                '<script type="module" src="/src/webview/main.ts"></script>'
            );
    },
};

export default defineConfig({
    plugins: [vue(), devHtmlShell],
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

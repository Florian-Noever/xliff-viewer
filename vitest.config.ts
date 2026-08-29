import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const VSCODE_MOCK = resolvePath('./src/test/__mocks__/vscode.ts');
const SHARED = resolvePath('./src/shared');

/**
 * Three projects (MASTER_PLAN §14.7, DEC-015):
 *
 *   data    — pure. NO alias for `vscode`, deliberately: a data test that imports it
 *             must fail to resolve. That failure is the standing proof that
 *             src/extension/xliff/ and src/shared/ stay dependency-free (§6.1).
 *   host    — `vscode` aliased to the hand-written mock.
 *   webview — jsdom, the Vue plugin, and an `acquireVsCodeApi` stub.
 *   perf    — the §16 wall-clock budgets, one file at a time and on their own. Run
 *             beside the others they measured 65 ms against a 60 ms budget and 23 ms
 *             alone; a timing assertion that depends on what else is running is not an
 *             assertion. `bun run test` runs this project after the other three.
 */
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'data',
                    environment: 'node',
                    include: ['src/test/data/**/*.test.ts'],
                },
            },
            {
                resolve: {
                    alias: { vscode: VSCODE_MOCK },
                },
                test: {
                    name: 'host',
                    environment: 'node',
                    include: ['src/test/host/**/*.test.ts'],
                },
            },
            {
                resolve: {
                    alias: { vscode: VSCODE_MOCK },
                },
                test: {
                    name: 'perf',
                    environment: 'node',
                    include: ['src/test/perf/**/*.perf.test.ts'],
                    fileParallelism: false,
                },
            },
            {
                plugins: [vue()],
                resolve: {
                    alias: { '@shared': SHARED },
                },
                test: {
                    name: 'webview',
                    environment: 'jsdom',
                    include: ['src/test/webview/**/*.test.ts'],
                    setupFiles: [resolvePath('./src/test/setup/webview.ts')],
                },
            },
        ],
    },
});

import { availableParallelism, totalmem } from 'node:os';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const VSCODE_MOCK = resolvePath('./src/test/__mocks__/vscode.ts');
const HOST_SETUP = resolvePath('./src/test/setup/host.ts');
const SHARED = resolvePath('./src/shared');

/**
 * Workers are bounded by memory as well as by processors. Vitest's default is one worker per
 * processor, and on a machine with many processors and little memory the workers exhaust it
 * and die mid-run. Each is given half a gigabyte, which the heaviest data test stays inside.
 */
const WORKER_MEMORY = 512 * 1024 * 1024;
const MAX_WORKERS = Math.max(1, Math.min(availableParallelism(), Math.floor(totalmem() / WORKER_MEMORY)));

/**
 * Five projects:
 *
 *   data    — pure. NO alias for `vscode`, deliberately: a data test that imports it
 *             must fail to resolve. That failure is the standing proof that
 *             src/extension/xliff/ and src/shared/ stay dependency-free. With
 *             UPDATE_FIXTURES=1 its global setup rewrites the generated fixtures first.
 *   host    — `vscode` aliased to the hand-written mock.
 *   webview — jsdom, the Vue plugin, and an `acquireVsCodeApi` stub.
 *   repo    — checks on the repository rather than on code: the manifest, the docs, the
 *             webview's sources and what the package ships. The last needs a build.
 *   perf    — the wall-clock budgets, one file at a time and on their own: a timing
 *             assertion that depends on what else is running is not an assertion.
 *             `npm test` runs this project after the other four.
 */
export default defineConfig({
    test: {
        maxWorkers: MAX_WORKERS,
        projects: [
            {
                test: {
                    name: 'data',
                    environment: 'node',
                    include: ['src/test/data/**/*.test.ts'],
                    globalSetup: [resolvePath('./src/test/setup/fixtures.ts')],
                },
            },
            {
                test: {
                    name: 'repo',
                    environment: 'node',
                    include: ['src/test/repo/**/*.test.ts'],
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
                    setupFiles: [HOST_SETUP],
                },
            },
            {
                resolve: {
                    // `@shared` too: the keystroke budget measures the webview's own
                    // search and flatten code, which is pure and runs fine in node.
                    alias: { vscode: VSCODE_MOCK, '@shared': SHARED },
                },
                test: {
                    name: 'perf',
                    environment: 'node',
                    include: ['src/test/perf/**/*.perf.test.ts'],
                    setupFiles: [HOST_SETUP],
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

import { listFiles } from '@vscode/vsce';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * `POLISH-04`. What ships, listed by the packager itself rather than by re-deriving
 * `.vscodeignore`'s glob semantics — which is the one way to be wrong about this while
 * looking right.
 *
 * An **allow-list**, not a deny-list. A deny-list only catches the mistakes already
 * imagined; this one catches the next file dropped at the repository root. The first run of
 * it found two: `CLAUDE.md`, 34 KB of instructions for whoever is editing this project, and
 * `.claude/launch.json`, a dev-server config written during `EDIT-03a`.
 */

const SHIPS = [
    'CHANGELOG.md',
    'LICENSE',
    'README.md',
    'assets/icon-dark.svg',
    'assets/icon-light-x512.png',
    'assets/icon-light.svg',
    'media/webview.html',
    'out/extension.js',
    'out/web/extension.js',
    'package.json',
    'public/app.js',
    'public/styles.css',
];

/**
 * The packager's own listing, through its API rather than its CLI.
 *
 * `vsce ls` on the command line runs `vscode:prepublish` first, which rebuilds everything
 * and costs 22 seconds; `listFiles` answers the same question in two. Asked once and shared,
 * because the answer cannot change within a run.
 */
let files: readonly string[] = [];

beforeAll(async () => {
    const listed = await listFiles({ cwd: process.cwd() });
    files = listed.map(file => file.split('\\').join('/')).sort();
}, 60_000);

describe('what the VSIX contains', () => {
    it('is exactly the twelve files the extension needs, and nothing else', () => {
        expect([...files]).toEqual(SHIPS);
    });

    it('carries both hosts, the webview bundle and the webview shell', () => {
        // Spelled out separately from the list above, because these five are the ones whose
        // absence makes an installed extension do nothing at all (§14.2, §11.1).
        for (const required of ['out/extension.js', 'out/web/extension.js', 'public/app.js', 'public/styles.css', 'media/webview.html']) {
            expect(files).toContain(required);
        }
    });

    it('carries no source, no corpus and no test file', () => {
        // `Examples/` holds translation files for trying the extension, not for a
        // VSIX; `src/` would ship the whole project to every user.
        expect(files.filter(file => file.startsWith('src/'))).toEqual([]);
        expect(files.filter(file => file.startsWith('Examples/'))).toEqual([]);
        expect(files.filter(file => file.startsWith('docs/'))).toEqual([]);
        // `assets/` is a working folder: four more icons live there that nothing uses.
        expect(files.filter(file => file.startsWith('assets/'))).toHaveLength(3);
        expect(files.filter(file => file.endsWith('.ts') || file.endsWith('.map'))).toEqual([]);
        expect(files).not.toContain('index.html');
    });
});

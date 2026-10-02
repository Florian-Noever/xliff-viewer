import { existsSync } from 'node:fs';
import { listFiles, PackageManager } from '@vscode/vsce';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * What ships, as listed by the packager itself from the manifest's `files`. Compared as a
 * whole, so a file that slips in or goes missing fails it.
 */

const SHIPS = [
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

/** Build output, which the packager can only list once it exists. */
const BUILT = ['out/extension.js', 'out/web/extension.js', 'public/app.js', 'public/styles.css'];

/**
 * The packager's own listing, through its API rather than `vsce ls`, which runs
 * `vscode:prepublish` and rebuilds everything first. Asked once: it cannot change within a run.
 *
 * Without dependencies, as a bundled extension is packed. Listing them asks `npm list`,
 * whose output masks any path segment shaped like a UUID, and the listing then comes back empty.
 */
let files: readonly string[] = [];

beforeAll(async () => {
    const unbuilt = BUILT.filter(path => !existsSync(path));
    if (unbuilt.length > 0) {
        throw new Error(`Not built: ${unbuilt.join(', ')}. Run npm run bundle and npm run build:webview first, as npm test does.`);
    }
    const listed = await listFiles({ cwd: process.cwd(), packageManager: PackageManager.None });
    files = listed.map(file => file.split('\\').join('/')).sort();
}, 60_000);

describe('what the VSIX contains', () => {
    it('is exactly the files the extension needs, and nothing else', () => {
        expect([...files]).toEqual(SHIPS);
    });

    it('carries both hosts, the webview bundle and the webview shell', () => {
        // Spelled out separately from the list above, because these five are the ones whose
        // absence makes an installed extension do nothing at all.
        for (const required of ['out/extension.js', 'out/web/extension.js', 'public/app.js', 'public/styles.css', 'media/webview.html']) {
            expect(files).toContain(required);
        }
    });

    it('carries no source, no fixture and no example file', () => {
        // `src/` would ship the whole project, fixtures included, to every user. `Examples/`
        // is a local, git-ignored folder; nothing in it may ship.
        expect(files.filter(file => file.startsWith('src/'))).toEqual([]);
        expect(files.filter(file => file.startsWith('Examples/'))).toEqual([]);
        expect(files.filter(file => file.startsWith('docs/'))).toEqual([]);
        // `assets/` is a working folder that also holds icons nothing uses.
        expect(files.filter(file => file.startsWith('assets/'))).toHaveLength(3);
        expect(files.filter(file => file.endsWith('.ts') || file.endsWith('.map'))).toEqual([]);
        expect(files).not.toContain('index.html');
    });
});

import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getWebviewHtml, localResourceRoots } from '../../extension/editor/webviewHtml';
import { resetMocks, setVirtualFile } from '../__mocks__/vscode';

const EXTENSION_URI = vscode.Uri.file('/ext');
const TEMPLATE = [
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src %CSP_SOURCE% data:; style-src %CSP_SOURCE%; font-src %CSP_SOURCE%; script-src \'nonce-%NONCE%\';" />',
    '<link rel="stylesheet" href="%CSS_URI%" />',
    '<script nonce="%NONCE%" src="%SCRIPT_URI%"></script>',
].join('\n');

/** Minimal stand-in for the Webview the provider passes in. */
function fakeWebview(): vscode.Webview {
    return {
        cspSource: 'vscode-webview://fake',
        asWebviewUri: (uri: vscode.Uri) => vscode.Uri.parse(`https://cdn.example/${uri.path}`),
    } as unknown as vscode.Webview;
}

beforeEach(() => {
    setVirtualFile('/ext/media/webview.html', TEMPLATE);
});

afterEach(() => {
    resetMocks();
});

describe('getWebviewHtml', () => {
    it('leaves no placeholder behind', async () => {
        const html = await getWebviewHtml(fakeWebview(), EXTENSION_URI);
        expect(html).not.toMatch(/%[A-Z_]+%/);
    });

    it('routes both asset URIs through asWebviewUri', async () => {
        const html = await getWebviewHtml(fakeWebview(), EXTENSION_URI);
        // A hand-built path would not resolve in the web host, which serves assets
        // through a service worker.
        expect(html).toContain('https://cdn.example//ext/public/app.js');
        expect(html).toContain('https://cdn.example//ext/public/styles.css');
    });

    it('injects the webview cspSource', async () => {
        const html = await getWebviewHtml(fakeWebview(), EXTENSION_URI);
        expect(html).toContain('vscode-webview://fake');
        expect(html).toContain("default-src 'none'");
    });

    it('uses a fresh nonce on every call', async () => {
        const first = await getWebviewHtml(fakeWebview(), EXTENSION_URI);
        const second = await getWebviewHtml(fakeWebview(), EXTENSION_URI);

        const nonceOf = (html: string): string => {
            const match = /nonce="([a-f0-9]+)"/.exec(html);
            expect(match).not.toBeNull();
            return match?.[1] ?? '';
        };

        expect(nonceOf(first)).toHaveLength(32);
        expect(nonceOf(first)).not.toBe(nonceOf(second));
    });

    it('reads the template through workspace.fs, not the real filesystem', async () => {
        resetMocks();
        await expect(getWebviewHtml(fakeWebview(), EXTENSION_URI)).rejects.toThrow('ENOENT');
    });
});

describe('localResourceRoots', () => {
    it('is the bundle folder alone: the template is read by the host, not loaded by the webview', () => {
        const roots = localResourceRoots(EXTENSION_URI).map(uri => uri.path);
        expect(roots).toEqual(['/ext/public']);
    });
});

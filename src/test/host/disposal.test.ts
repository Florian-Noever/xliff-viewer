import * as vscode from 'vscode';
import { beforeEach, describe, expect, it } from 'vitest';

import { XliffEditorProvider } from '../../extension/editor/xliffEditorProvider';
import { WebviewMessageType } from '../../shared/messages';
import {
    configurationListenerCount,
    documentChangeListenerCount,
    emitterListenerCount,
    FakeTextDocument,
    holdFileRead,
    setVirtualFile,
    setWorkspaceRoot,
    watcherCount,
} from '../__mocks__/vscode';
import { fakeWebviewPanel } from '../support/fakeWebviewPanel';

import type { FakeWebviewPanel } from '../support/fakeWebviewPanel';

/**
 * Twenty editors opened and closed, because a leak of one listener per editor is invisible
 * in any single one and only adds up over a long session.
 */

const TEMPLATE = '<script nonce="%NONCE%" src="%SCRIPT_URI%"></script><link href="%CSS_URI%"><meta content="%CSP_SOURCE%">';
const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="de-DE" original="App"><body>
  <trans-unit id="Table 1 - Property 2"><source>Customer</source><target state="translated">Kunde</target></trans-unit>
</body></file></xliff>`;

const document = (name: string): vscode.TextDocument =>
    new FakeTextDocument(`/w/${name}.xlf`, FIXTURE) as unknown as vscode.TextDocument;

/** Lets the views' asynchronous subscriptions land. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    setVirtualFile('/ext/media/webview.html', TEMPLATE);
    // An app with AL source, so every view also subscribes to its AL files.
    setWorkspaceRoot('/w');
    setVirtualFile('/w/app.json', '{}');
    setVirtualFile('/w/src/Customer.Table.al', 'table 50100 Customer { }');
});

describe('twenty editors', () => {
    it('leave nothing behind when they are closed', async () => {
        const provider = new XliffEditorProvider(vscode.Uri.file('/ext'));
        // The provider's own base-file resolver and watcher listen for its whole life, so
        // the baseline is what a provider with no editors already holds.
        const baseline = configurationListenerCount();
        const baselineEmitters = emitterListenerCount();
        const baselineWatchers = watcherCount();
        const panels: FakeWebviewPanel[] = [];

        for (let index = 0; index < 20; index++) {
            const panel = fakeWebviewPanel();
            panels.push(panel);
            await provider.resolveCustomTextEditor(document(`file-${index}`), panel.panel, {} as vscode.CancellationToken);
            panel.send({ type: WebviewMessageType.ready });
        }

        await settle();
        expect(documentChangeListenerCount()).toBe(20);
        expect(configurationListenerCount()).toBe(baseline + 20);
        expect(emitterListenerCount()).toBeGreaterThanOrEqual(baselineEmitters + 20);
        // Twenty files of one app share one AL index.
        expect(watcherCount()).toBe(baselineWatchers + 1);

        for (const panel of panels) {
            panel.dispose();
        }

        expect(documentChangeListenerCount()).toBe(0);
        expect(configurationListenerCount()).toBe(baseline);
        expect(emitterListenerCount()).toBe(baselineEmitters);
        expect(watcherCount()).toBe(baselineWatchers);
        expect(panels.map(panel => panel.listening())).toEqual(panels.map(() => 0));

        provider.dispose();

        expect(configurationListenerCount()).toBe(0);
        expect(emitterListenerCount()).toBe(0);
        expect(watcherCount()).toBe(0);
    });

    it('share one session when they are twenty views of the same document', async () => {
        const provider = new XliffEditorProvider(vscode.Uri.file('/ext'));
        const baseline = configurationListenerCount();
        const shared = document('shared');
        const panels: FakeWebviewPanel[] = [];

        for (let index = 0; index < 20; index++) {
            const panel = fakeWebviewPanel();
            panels.push(panel);
            await provider.resolveCustomTextEditor(shared, panel.panel, {} as vscode.CancellationToken);
        }

        // One parse subscription for the document, twenty configuration listeners — one
        // per view, because each view answers for its own webview.
        expect(documentChangeListenerCount()).toBe(1);
        expect(configurationListenerCount()).toBe(baseline + 20);

        for (const panel of panels) {
            panel.dispose();
        }

        expect(documentChangeListenerCount()).toBe(0);
        expect(configurationListenerCount()).toBe(baseline);
    });

    it('let go of an AL index that arrives after they closed', async () => {
        const provider = new XliffEditorProvider(vscode.Uri.file('/ext'));
        const watching = watcherCount();
        // The app is still being looked up when the panel closes.
        const release = holdFileRead('/w/app.json');
        const panel = fakeWebviewPanel();
        await provider.resolveCustomTextEditor(document('closed-early'), panel.panel, {} as vscode.CancellationToken);

        panel.dispose();
        release();
        await settle();

        expect(watcherCount()).toBe(watching);
        provider.dispose();
    });

    it('are all disposed when the provider itself goes', async () => {
        const provider = new XliffEditorProvider(vscode.Uri.file('/ext'));
        for (let index = 0; index < 20; index++) {
            await provider.resolveCustomTextEditor(document(`file-${index}`), fakeWebviewPanel().panel, {} as vscode.CancellationToken);
        }

        provider.dispose();

        expect(documentChangeListenerCount()).toBe(0);
    });
});

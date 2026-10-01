import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { XliffEditorProvider } from '../../extension/editor/xliffEditorProvider';
import { Logger } from '../../extension/services/logger';
import { WebviewMessageType } from '../../shared/messages';
import {
    configurationListenerCount,
    documentChangeListenerCount,
    emitterListenerCount,
    FakeTextDocument,
    holdFileRead,
    resetMocks,
    setVirtualFile,
    setWorkspaceRoot,
    watcherCount,
} from '../__mocks__/vscode';

import type { ExtensionMessage } from '../../shared/messages';

/**
 * Twenty editors opened and closed, because a leak of one listener per editor is invisible
 * in any single one and only adds up over a long session.
 */

const TEMPLATE = '<script nonce="%NONCE%" src="%SCRIPT_URI%"></script><link href="%CSS_URI%"><meta content="%CSP_SOURCE%">';
const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="de-DE" original="App"><body>
  <trans-unit id="Table 1 - Property 2"><source>Customer</source><target state="translated">Kunde</target></trans-unit>
</body></file></xliff>`;

interface Panel {
    readonly panel: vscode.WebviewPanel;
    close(): void;
    ready(): void;
    /** How many message listeners the panel still holds. */
    listening(): number;
    readonly posted: ExtensionMessage[];
}

function fakePanel(): Panel {
    const posted: ExtensionMessage[] = [];
    const listeners: ((message: unknown) => void)[] = [];
    const disposers: (() => void)[] = [];

    const panel = {
        webview: {
            options: {},
            html: '',
            cspSource: 'x',
            asWebviewUri: (uri: vscode.Uri) => uri,
            postMessage: (message: ExtensionMessage) => {
                posted.push(message);
                return Promise.resolve(true);
            },
            onDidReceiveMessage: (listener: (message: unknown) => void) => {
                listeners.push(listener);
                return new vscode.Disposable(() => {
                    listeners.splice(listeners.indexOf(listener), 1);
                });
            },
        },
        onDidDispose: (handler: () => void) => {
            disposers.push(handler);
            return new vscode.Disposable(() => { });
        },
    } as unknown as vscode.WebviewPanel;

    return {
        panel,
        posted,
        listening: () => listeners.length,
        ready: () => {
            for (const listener of listeners) {
                listener({ type: WebviewMessageType.ready });
            }
        },
        close: () => {
            for (const handler of disposers) {
                handler();
            }
        },
    };
}

const document = (name: string): vscode.TextDocument =>
    new FakeTextDocument(`/w/${name}.xlf`, FIXTURE) as unknown as vscode.TextDocument;

/** Lets the views' asynchronous subscriptions land. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
    setVirtualFile('/ext/media/webview.html', TEMPLATE);
    // An app with AL source, so every view also subscribes to its AL files.
    setWorkspaceRoot('/w');
    setVirtualFile('/w/app.json', '{}');
    setVirtualFile('/w/src/Customer.Table.al', 'table 50100 Customer { }');
});

afterEach(() => {
    resetMocks();
});

describe('twenty editors', () => {
    it('leave nothing behind when they are closed', async () => {
        const provider = new XliffEditorProvider(vscode.Uri.file('/ext'));
        // The provider's own base-file resolver and watcher listen for its whole life, so
        // the baseline is what a provider with no editors already holds.
        const baseline = configurationListenerCount();
        const baselineEmitters = emitterListenerCount();
        const baselineWatchers = watcherCount();
        const panels: Panel[] = [];

        for (let index = 0; index < 20; index++) {
            const panel = fakePanel();
            panels.push(panel);
            await provider.resolveCustomTextEditor(document(`file-${index}`), panel.panel, {} as vscode.CancellationToken);
            panel.ready();
        }

        await settle();
        expect(documentChangeListenerCount()).toBe(20);
        expect(configurationListenerCount()).toBe(baseline + 20);
        expect(emitterListenerCount()).toBeGreaterThanOrEqual(baselineEmitters + 20);
        // Twenty files of one app share one AL index.
        expect(watcherCount()).toBe(baselineWatchers + 1);

        for (const panel of panels) {
            panel.close();
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
        const panels: Panel[] = [];

        for (let index = 0; index < 20; index++) {
            const panel = fakePanel();
            panels.push(panel);
            await provider.resolveCustomTextEditor(shared, panel.panel, {} as vscode.CancellationToken);
        }

        // One parse subscription for the document, twenty configuration listeners — one
        // per view, because each view answers for its own webview.
        expect(documentChangeListenerCount()).toBe(1);
        expect(configurationListenerCount()).toBe(baseline + 20);

        for (const panel of panels) {
            panel.close();
        }

        expect(documentChangeListenerCount()).toBe(0);
        expect(configurationListenerCount()).toBe(baseline);
    });

    it('let go of an AL index that arrives after they closed', async () => {
        const provider = new XliffEditorProvider(vscode.Uri.file('/ext'));
        const watching = watcherCount();
        // The app is still being looked up when the panel closes.
        const release = holdFileRead('/w/app.json');
        const panel = fakePanel();
        await provider.resolveCustomTextEditor(document('closed-early'), panel.panel, {} as vscode.CancellationToken);

        panel.close();
        release();
        await settle();

        expect(watcherCount()).toBe(watching);
        provider.dispose();
    });

    it('are all disposed when the provider itself goes', async () => {
        const provider = new XliffEditorProvider(vscode.Uri.file('/ext'));
        for (let index = 0; index < 20; index++) {
            await provider.resolveCustomTextEditor(document(`file-${index}`), fakePanel().panel, {} as vscode.CancellationToken);
        }

        provider.dispose();

        expect(documentChangeListenerCount()).toBe(0);
    });
});

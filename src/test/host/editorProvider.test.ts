import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { XliffEditorProvider } from '../../extension/editor/xliffEditorProvider';
import { Logger } from '../../extension/services/logger';
import { ExtensionMessageType, WebviewMessageType } from '../../shared/messages';
import {
    documentChangeListenerCount,
    FakeTextDocument,
    fireConfigurationChange,
    flushLogs,
    resetMocks,
    setConfigOverride,
    setVirtualFile,
} from '../__mocks__/vscode';

import type { ExtensionMessage } from '../../shared/messages';

const EXTENSION_URI = vscode.Uri.file('/ext');
const TEMPLATE = '<script nonce="%NONCE%" src="%SCRIPT_URI%"></script><link href="%CSS_URI%"><meta content="%CSP_SOURCE%">';
const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="de-DE" original="App"><body>
  <trans-unit id="Table 1 - Property 2"><source>Customer</source><target state="translated">Kunde</target></trans-unit>
</body></file></xliff>`;

interface Harness {
    readonly posted: ExtensionMessage[];
    send(message: unknown): void;
    dispose(): void;
}

async function openEditor(): Promise<Harness> {
    const posted: ExtensionMessage[] = [];
    const listeners: ((message: unknown) => void)[] = [];
    const disposeHandlers: (() => void)[] = [];
    const disposed: boolean[] = [];

    const panel = {
        webview: {
            options: {},
            html: '',
            cspSource: 'vscode-webview://fake',
            asWebviewUri: (uri: vscode.Uri) => uri,
            postMessage: (message: ExtensionMessage) => {
                posted.push(message);
                return Promise.resolve(true);
            },
            onDidReceiveMessage: (listener: (message: unknown) => void) => {
                listeners.push(listener);
                return new vscode.Disposable(() => disposed.push(true));
            },
        },
        onDidDispose: (handler: () => void) => {
            disposeHandlers.push(handler);
            return new vscode.Disposable(() => { });
        },
    } as unknown as vscode.WebviewPanel;

    const document = new FakeTextDocument('/w/App.de-DE.xlf', FIXTURE) as unknown as vscode.TextDocument;
    const provider = new XliffEditorProvider(EXTENSION_URI);
    await provider.resolveCustomTextEditor(document, panel, {} as vscode.CancellationToken);

    return {
        posted,
        send: (message: unknown) => {
            for (const listener of listeners) {
                listener(message);
            }
        },
        dispose: () => {
            for (const handler of disposeHandlers) {
                handler();
            }
        },
    };
}

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
    setVirtualFile('/ext/media/webview.html', TEMPLATE);
    flushLogs();
});

afterEach(() => {
    resetMocks();
});

describe('the editor provider', () => {
    it('posts nothing until the webview says it is ready', async () => {
        const harness = await openEditor();
        expect(harness.posted).toEqual([]);
    });

    it('answers ready with the settings, then the parsed document', async () => {
        setConfigOverride('xliffViewer.defaultExpandDepth', 4);
        const harness = await openEditor();

        harness.send({ type: WebviewMessageType.ready });

        expect(harness.posted.map(message => message.type)).toEqual([
            ExtensionMessageType.settings,
            ExtensionMessageType.loading,
            ExtensionMessageType.setDocument,
        ]);
        expect(harness.posted[0]).toEqual({
            type: ExtensionMessageType.settings,
            payload: { editMode: false, showDeveloperNotes: true, showGeneratorNotes: false, defaultExpandDepth: 4, validationEnabled: true },
        });

        const document = harness.posted[2];
        expect(document.type === ExtensionMessageType.setDocument && document.payload.fileName).toBe('App.de-DE.xlf');
        expect(document.type === ExtensionMessageType.setDocument && document.payload.files[0].units).toHaveLength(1);
    });

    it('logs and ignores a message that is not in the contract, rather than throwing', async () => {
        const harness = await openEditor();

        expect(() => {
            harness.send({ type: 'definitelyNotOurs' });
            harness.send({ type: WebviewMessageType.updateTarget, unitId: 'x' });
            harness.send(null);
        }).not.toThrow();

        expect(harness.posted).toEqual([]);
        expect(flushLogs().filter(line => line.startsWith('warn'))).toHaveLength(3);
    });

    it('re-sends settings when configuration changes, without re-sending the document', async () => {
        const harness = await openEditor();
        harness.send({ type: WebviewMessageType.ready });
        harness.posted.length = 0;

        setConfigOverride('xliffViewer.editMode', true);
        fireConfigurationChange('xliffViewer.editMode');

        expect(harness.posted).toEqual([{
            type: ExtensionMessageType.settings,
            payload: { editMode: true, showDeveloperNotes: true, showGeneratorNotes: false, defaultExpandDepth: 1, validationEnabled: true },
        }]);
    });

    it('ignores a configuration change in someone else\'s section', async () => {
        const harness = await openEditor();

        fireConfigurationChange('editor.fontSize', 'xliffSync.baseFile');

        expect(harness.posted).toEqual([]);
    });

    it('releases the document session when the panel closes', async () => {
        const harness = await openEditor();
        expect(documentChangeListenerCount()).toBe(1);

        harness.dispose();

        expect(documentChangeListenerCount()).toBe(0);
    });

    it('stops listening for configuration changes once the panel is disposed', async () => {
        const harness = await openEditor();
        harness.dispose();

        fireConfigurationChange('xliffViewer.editMode');

        expect(harness.posted).toEqual([]);
    });
});

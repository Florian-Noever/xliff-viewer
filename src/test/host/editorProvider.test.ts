import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { XliffEditorProvider } from '../../extension/editor/xliffEditorProvider';
import { Logger } from '../../extension/services/logger';
import { ExtensionMessageType, WebviewMessageType } from '../../shared/messages';
import {
    customEditorRegistrations,
    documentChangeListenerCount,
    FakeTextDocument,
    fireConfigurationChange,
    fireFileWatcher,
    fireTextDocumentChange,
    flushInfoMessages,
    flushLogs,
    removeVirtualFile,
    resetMocks,
    setConfigOverride,
    setVirtualFile,
} from '../__mocks__/vscode';

import type { TransUnitDto } from '../../shared/dto';
import type { ExtensionMessage } from '../../shared/messages';

const EXTENSION_URI = vscode.Uri.file('/ext');
const TEMPLATE = '<script nonce="%NONCE%" src="%SCRIPT_URI%"></script><link href="%CSS_URI%"><meta content="%CSP_SOURCE%">';
const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="de-DE" original="App"><body>
  <trans-unit id="Table 1 - Property 2"><source>Customer</source><target state="translated">Kunde</target>
  <note from="Xliff Generator">Table Customer - Property Caption</note></trans-unit>
</body></file></xliff>`;

interface Harness {
    readonly posted: ExtensionMessage[];
    readonly panel: vscode.WebviewPanel;
    send(message: unknown): void;
    dispose(): void;
}

async function openEditor(supplied?: FakeTextDocument): Promise<Harness> {
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

    const document = supplied ?? new FakeTextDocument('/w/App.de-DE.xlf', FIXTURE);
    const provider = new XliffEditorProvider(EXTENSION_URI);
    await provider.resolveCustomTextEditor(document as unknown as vscode.TextDocument, panel, {} as vscode.CancellationToken);

    return {
        posted,
        panel,
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

/** The base-file and AL-source announcements are fire-and-forget; let them land. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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
            payload: { editMode: false, showDeveloperNotes: true, showGeneratorNotes: false, defaultExpandDepth: 4, validationEnabled: true, validationSameAsSource: false },
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
            payload: { editMode: true, showDeveloperNotes: true, showGeneratorNotes: false, defaultExpandDepth: 1, validationEnabled: true, validationSameAsSource: false },
        }]);
    });

    it('ignores a configuration change in someone else\'s section', async () => {
        const harness = await openEditor();

        fireConfigurationChange('editor.fontSize', 'xliffSync.baseFile');

        expect(harness.posted).toEqual([]);
    });

    it('releases the session when the panel closes while the editor is still resolving', async () => {
        // The template read is awaited before any listener is wired. A panel disposed in
        // that window must still release its session and its change subscription.
        const disposeHandlers: (() => void)[] = [];
        const panel = {
            webview: {
                options: {},
                html: '',
                cspSource: 'x',
                asWebviewUri: (uri: vscode.Uri) => uri,
                postMessage: () => Promise.resolve(true),
                onDidReceiveMessage: () => new vscode.Disposable(() => { }),
            },
            onDidDispose: (handler: () => void) => {
                disposeHandlers.push(handler);
                return new vscode.Disposable(() => { });
            },
        } as unknown as vscode.WebviewPanel;

        const document = new FakeTextDocument('/w/App.de-DE.xlf', FIXTURE) as unknown as vscode.TextDocument;
        const resolving = new XliffEditorProvider(EXTENSION_URI)
            .resolveCustomTextEditor(document, panel, {} as vscode.CancellationToken);

        await Promise.resolve();
        for (const handler of disposeHandlers) {
            handler();
        }
        await resolving;

        expect(documentChangeListenerCount()).toBe(0);
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

describe('what survives a re-parse', () => {
    const BASE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="en-US" original="App"><body>
  <trans-unit id="Table 1 - Property 2"><source>Customer (renamed)</source></trans-unit>
</body></file></xliff>`;

    const language = (source: string): string => `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="de-DE" original="App"><body>
  <trans-unit id="Table 1 - Property 2"><source>${source}</source><target state="translated">Kunde</target></trans-unit>
</body></file></xliff>`;

    const afterDebounce = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 250));

    const patchedUnits = (posted: readonly ExtensionMessage[]): readonly TransUnitDto[] => {
        const patch = posted.find(message => message.type === ExtensionMessageType.patchUnits);
        return patch?.type === ExtensionMessageType.patchUnits ? patch.payload.units : [];
    };

    it('re-announces the base file and the pairing markers, which a setDocument replaces', async () => {
        setVirtualFile('/w/App.g.xlf', BASE);
        const document = new FakeTextDocument('/w/App.de-DE.xlf', language('Customer'));
        const harness = await openEditor(document);

        harness.send({ type: WebviewMessageType.ready });
        await settle();
        expect(harness.posted.map(message => message.type)).toEqual([
            ExtensionMessageType.settings,
            ExtensionMessageType.loading,
            ExtensionMessageType.setDocument,
            ExtensionMessageType.baseFile,
            ExtensionMessageType.patchUnits,
        ]);

        harness.posted.length = 0;
        document.setText(language('Customer edited'));
        fireTextDocumentChange(document);
        await afterDebounce();
        await settle();

        // Without this the panel keeps a document whose baseFile is gone and whose
        // orphaned/source-changed markers were dropped with the payload they rode on.
        expect(harness.posted.map(message => message.type)).toEqual([
            ExtensionMessageType.setDocument,
            ExtensionMessageType.baseFile,
            ExtensionMessageType.patchUnits,
        ]);
    });

    it('re-marks the units when the compiler rewrites the base file underneath', async () => {
        setVirtualFile('/w/App.g.xlf', BASE);
        const document = new FakeTextDocument('/w/App.de-DE.xlf', language('Customer'));
        const harness = await openEditor(document);
        harness.send({ type: WebviewMessageType.ready });
        await settle();

        harness.posted.length = 0;
        setVirtualFile('/w/App.g.xlf', BASE.replace('Customer (renamed)', 'Customer'));
        fireFileWatcher('changed', '/w/App.g.xlf');
        await settle();

        // The document did not change; the file it is paired against did. The unit
        // now agrees with its base, so the marker has to come *off* — which `patchUnits`
        // can only do by sending the unit again without one.
        const cleared = patchedUnits(harness.posted);
        expect(cleared).toHaveLength(1);
        expect(cleared[0].id).toBe('Table 1 - Property 2');
        expect(cleared[0].baseSource).toBeUndefined();
        expect(cleared[0].orphaned).toBeUndefined();
    });

    it('marks units the compiler has just changed under an untouched translation', async () => {
        setVirtualFile('/w/App.g.xlf', BASE.replace('Customer (renamed)', 'Customer'));
        const document = new FakeTextDocument('/w/App.de-DE.xlf', language('Customer'));
        const harness = await openEditor(document);
        harness.send({ type: WebviewMessageType.ready });
        await settle();
        expect(harness.posted.some(message => message.type === ExtensionMessageType.patchUnits)).toBe(false);

        harness.posted.length = 0;
        setVirtualFile('/w/App.g.xlf', BASE);
        fireFileWatcher('changed', '/w/App.g.xlf');
        await settle();

        expect(patchedUnits(harness.posted)[0].baseSource).toBe('Customer (renamed)');
    });

    it('takes the markers off when the base file goes away entirely', async () => {
        setVirtualFile('/w/App.g.xlf', BASE);
        const document = new FakeTextDocument('/w/App.de-DE.xlf', language('Customer'));
        const harness = await openEditor(document);
        harness.send({ type: WebviewMessageType.ready });
        await settle();

        harness.posted.length = 0;
        removeVirtualFile('/w/App.g.xlf');
        fireFileWatcher('deleted', '/w/App.g.xlf');
        await settle();

        expect(harness.posted.find(message => message.type === ExtensionMessageType.baseFile)?.payload).toBeNull();
        const cleared = patchedUnits(harness.posted);
        expect(cleared).toHaveLength(1);
        expect(cleared[0].baseSource).toBeUndefined();
    });

    it('stops listening for base-file changes once the panel is gone', async () => {
        setVirtualFile('/w/App.g.xlf', BASE);
        const document = new FakeTextDocument('/w/App.de-DE.xlf', language('Customer'));
        const harness = await openEditor(document);
        harness.send({ type: WebviewMessageType.ready });
        await settle();

        harness.dispose();
        harness.posted.length = 0;
        fireFileWatcher('changed', '/w/App.g.xlf');
        await settle();

        expect(harness.posted).toEqual([]);
    });

    it('sends only the failure when the re-parse fails, and no stale pairing with it', async () => {
        setVirtualFile('/w/App.g.xlf', BASE);
        const document = new FakeTextDocument('/w/App.de-DE.xlf', language('Customer'));
        const harness = await openEditor(document);
        harness.send({ type: WebviewMessageType.ready });
        await settle();

        harness.posted.length = 0;
        document.setText('<xliff version="1.2"><file>');
        fireTextDocumentChange(document);
        await afterDebounce();
        await settle();

        expect(harness.posted.map(message => message.type)).toEqual([ExtensionMessageType.error]);
    });
});

describe('navigation that cannot go anywhere still says so', () => {
    it('refuses to look for a base file\'s own base file', async () => {
        const document = new FakeTextDocument('/w/App.g.xlf', `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="en-US" original="App"><body>
  <trans-unit id="Table 1 - Property 2"><source>Customer</source></trans-unit>
</body></file></xliff>`);
        const harness = await openEditor(document);
        harness.send({ type: WebviewMessageType.ready });
        await settle();

        harness.send({
            type: WebviewMessageType.openSource,
            target: 'base',
            fileIndex: 0,
            unitId: 'Table 1 - Property 2',
        });
        await settle();

        expect(flushInfoMessages()).toEqual(['This file is the base file.']);
    });

    it('names the missing unit rather than opening nothing quietly', async () => {
        const harness = await openEditor();
        harness.send({ type: WebviewMessageType.ready });
        await settle();

        harness.send({ type: WebviewMessageType.openSource, target: 'base' });
        await settle();

        expect(flushInfoMessages()).toEqual(['Choose a unit to show in the base file.']);
    });
});

describe('how the editor is registered', () => {
    it('does not ask VS Code to keep a hidden tab alive', () => {
        // `retainContextWhenHidden` costs memory per open tab; a recreated webview asks for
        // the document again and restores its view state from what it saved.
        customEditorRegistrations.length = 0;
        const context = { extensionUri: vscode.Uri.file('/ext'), subscriptions: [] } as unknown as vscode.ExtensionContext;

        XliffEditorProvider.register(context);

        const [registration] = customEditorRegistrations;
        expect(registration.viewType).toBe('xliff-viewer.editor');
        expect(JSON.stringify(registration.options)).not.toContain('retainContextWhenHidden');
        expect(registration.options).toEqual({ supportsMultipleEditorsPerDocument: true });
    });
});

describe('the icon on the editor tab', () => {
    // VS Code names these by the theme they are shown *under*, not by their own colour, and
    // the pairing is the one thing here that is easy to get backwards.
    it('gives a light theme the dark-inked icon, and a dark theme the light one', async () => {
        const harness = await openEditor();

        const icons = harness.panel.iconPath as { light: vscode.Uri; dark: vscode.Uri };

        expect(icons.light.path).toContain('assets/icon-dark.svg');
        expect(icons.dark.path).toContain('assets/icon-light.svg');
        harness.dispose();
    });

    it('resolves both against the extension, not the workspace', async () => {
        const harness = await openEditor();

        const icons = harness.panel.iconPath as { light: vscode.Uri; dark: vscode.Uri };

        expect(icons.light.path.startsWith(EXTENSION_URI.path)).toBe(true);
        expect(icons.dark.path.startsWith(EXTENSION_URI.path)).toBe(true);
        harness.dispose();
    });
});

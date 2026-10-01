import * as vscode from 'vscode';

import { DocumentSessionRegistry } from './documentSessionRegistry';
import { XliffDocumentView } from './documentView';
import { AlSourceIndexes } from '../services/alSourceIndex';
import { BaseFileIndex } from '../services/baseFileIndex';
import { BaseFileResolver } from '../services/baseFileResolver';
import { BaseFileWatcher } from '../services/baseFileWatcher';
import { getWebviewHtml, localResourceRoots } from './webviewHtml';
import { dispatch } from '../handlers';
import { Logger } from '../services/logger';
import { affectsSettings, readSettings, toWebviewSettings } from '../services/settings';

import { ExtensionMessageType, isWebviewMessage } from '../../shared/messages';

import type { HandlerContext } from '../handlers/handlerContext';
import type { ExtensionMessage } from '../../shared/messages';

/**
 * VS Code names these by the theme they are *for*, not by their own colour: `light` is shown
 * under a light theme, so it is the dark-inked icon.
 */
const TAB_ICON = {
    light: ['assets', 'icon-dark.svg'],
    dark: ['assets', 'icon-light.svg'],
} as const;

/**
 * Wraps a `TextDocument` rather than owning its own model, so dirty state, undo/redo,
 * save, hot exit and "Reopen with Text Editor" all come from VS Code.
 *
 * The provider owns no parsing itself — it acquires the document's session, connects one
 * webview to it, and drops both when the panel closes.
 */
export class XliffEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'xliff-viewer.editor';

    private readonly extensionUri: vscode.Uri;
    private readonly registry = new DocumentSessionRegistry();
    private readonly baseFileWatcher = new BaseFileWatcher();
    private readonly baseFiles = new BaseFileResolver();
    private readonly baseIndex = new BaseFileIndex();
    private readonly alSources = new AlSourceIndexes();
    private readonly baseFileChanges: vscode.Disposable;

    public constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        // The resolver forgets before the index tells the panels, so a panel that announces
        // again finds neither cache stale.
        this.baseFileChanges = this.baseFileWatcher.onDidChange((uri) => {
            this.baseFiles.invalidate();
            this.baseIndex.forget(uri);
        });
    }

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new XliffEditorProvider(context.extensionUri);
        // No `retainContextWhenHidden`: a hidden tab's webview is rebuilt from the cached parse
        // on reveal, and puts its view state back from `vscode.setState`.
        const registration = vscode.window.registerCustomEditorProvider(XliffEditorProvider.viewType, provider, {
            supportsMultipleEditorsPerDocument: true,
        });

        return new vscode.Disposable(() => {
            registration.dispose();
            provider.dispose();
        });
    }

    public dispose(): void {
        this.baseFileChanges.dispose();
        this.baseFileWatcher.dispose();
        this.registry.dispose();
        this.baseFiles.dispose();
        this.baseIndex.dispose();
        this.alSources.dispose();
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        const session = this.registry.acquire(document);
        const subscriptions: vscode.Disposable[] = [];
        let closed = false;

        // Registered before the first await: a panel closed while the template is still
        // being read would otherwise never release its session, and the session's change
        // subscription would outlive the editor.
        webviewPanel.onDidDispose(() => {
            closed = true;
            for (const subscription of subscriptions) {
                subscription.dispose();
            }
            subscriptions.length = 0;
            this.registry.release(session);
        });

        webviewPanel.iconPath = {
            light: vscode.Uri.joinPath(this.extensionUri, ...TAB_ICON.light),
            dark: vscode.Uri.joinPath(this.extensionUri, ...TAB_ICON.dark),
        };
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots(this.extensionUri),
        };
        webviewPanel.webview.html = await getWebviewHtml(webviewPanel.webview, this.extensionUri);

        if (closed) {
            return;
        }

        const post = (message: ExtensionMessage): void => {
            void webviewPanel.webview.postMessage(message);
        };
        const view = new XliffDocumentView(session, post, {
            baseFiles: this.baseFiles,
            baseIndex: this.baseIndex,
            alSources: this.alSources,
        });
        const context: HandlerContext = {
            post,
            view,
            settings: () => toWebviewSettings(readSettings(document.uri)),
        };

        subscriptions.push(
            view,
            // A change reaches every view of this document, including the ones that did
            // not cause it. The view decides what each kind is worth saying: a re-parse is
            // a document, our own edit is one unit.
            session.attach((change) => {
                view.apply(change);
            }),
            webviewPanel.webview.onDidReceiveMessage((message: unknown) => {
                if (!isWebviewMessage(message)) {
                    Logger.warn(`Ignored unrecognised webview message: ${JSON.stringify(message)}`);
                    return;
                }
                void dispatch(message, context);
            }),
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (affectsSettings(event, document.uri)) {
                    post({ type: ExtensionMessageType.settings, payload: context.settings() });
                }
            }),
        );

        Logger.info(`Opened ${document.uri.toString()} in the XLIFF editor.`);
    }
}

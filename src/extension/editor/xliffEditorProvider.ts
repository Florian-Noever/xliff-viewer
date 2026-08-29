import * as vscode from 'vscode';

import { DocumentSessionRegistry } from './documentSessionRegistry';
import { createDocumentSession, postUpdate } from './documentView';
import { getWebviewHtml, localResourceRoots } from './webviewHtml';
import { dispatch } from '../handlers';
import { Logger } from '../services/logger';
import { affectsSettings, readSettings, toWebviewSettings } from '../services/settings';

import { ExtensionMessageType, isWebviewMessage } from '../../shared/messages';

import type { HandlerContext } from '../handlers/handlerContext';
import type { ExtensionMessage } from '../../shared/messages';

/**
 * Wraps a `TextDocument` rather than owning its own model (`DEC-001`), so dirty state,
 * undo/redo, save, hot exit and "Reopen with Text Editor" all come from VS Code.
 *
 * The provider owns no parsing itself — it acquires the document's session, connects one
 * webview to it, and drops both when the panel closes.
 */
export class XliffEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'xliff-viewer.editor';

    private readonly extensionUri: vscode.Uri;
    private readonly registry = new DocumentSessionRegistry();

    public constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new XliffEditorProvider(context.extensionUri);
        const registration = vscode.window.registerCustomEditorProvider(XliffEditorProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: true,
        });

        return new vscode.Disposable(() => {
            registration.dispose();
            provider.dispose();
        });
    }

    public dispose(): void {
        this.registry.dispose();
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
        const context: HandlerContext = {
            post,
            session: createDocumentSession(session, post),
            settings: () => toWebviewSettings(readSettings(document.uri)),
        };

        subscriptions.push(
            // A re-parse reaches every view of this document, including the ones that
            // did not trigger it. `postUpdate`, not the initial send: these panels are
            // already showing the document, so a failure sends only the failure.
            session.attach((state) => {
                postUpdate(state, post);
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

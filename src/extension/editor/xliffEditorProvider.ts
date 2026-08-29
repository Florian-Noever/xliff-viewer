import * as vscode from 'vscode';

import { createDocumentSession, postState } from './documentSession';
import { DocumentSessionRegistry } from './documentSessionRegistry';
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
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots(this.extensionUri),
        };
        webviewPanel.webview.html = await getWebviewHtml(webviewPanel.webview, this.extensionUri);

        const post = (message: ExtensionMessage): void => {
            void webviewPanel.webview.postMessage(message);
        };

        const session = this.registry.acquire(document);
        const context: HandlerContext = {
            post,
            session: createDocumentSession(session, post),
            settings: () => toWebviewSettings(readSettings(document.uri)),
        };

        const subscriptions = [
            // A re-parse reaches every view of this document, including the ones that did
            // not trigger it.
            session.attach((state) => {
                postState(state, session, post);
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
        ];

        webviewPanel.onDidDispose(() => {
            for (const subscription of subscriptions) {
                subscription.dispose();
            }
            this.registry.release(session);
        });

        Logger.info(`Opened ${document.uri.toString()} in the XLIFF editor.`);
    }
}

import * as vscode from 'vscode';

import { createPendingSession } from './documentSession';
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
 * `HOST-01` wires the protocol, the dispatch and the settings. The document session it
 * hands the handlers is still the pending one — parsing and the change pipeline are
 * `HOST-02`.
 */
export class XliffEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'xliff-viewer.editor';

    private readonly extensionUri: vscode.Uri;

    public constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new XliffEditorProvider(context.extensionUri);
        return vscode.window.registerCustomEditorProvider(XliffEditorProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: true,
        });
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
        const context: HandlerContext = {
            post,
            session: createPendingSession(post),
            settings: () => toWebviewSettings(readSettings(document.uri)),
        };

        const subscriptions = [
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
        });

        Logger.info(`Opened ${document.uri.toString()} in the XLIFF editor.`);
    }
}

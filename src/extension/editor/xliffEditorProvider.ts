import * as vscode from 'vscode';

import { getWebviewHtml, localResourceRoots } from './webviewHtml';
import { Logger } from '../services/logger';

import { ExtensionMessageType, isWebviewMessage, WebviewMessageType } from '../../shared/messages';

/**
 * Wraps a `TextDocument` rather than owning its own model (`DEC-001`), so dirty state,
 * undo/redo, save, hot exit and "Reopen with Text Editor" all come from VS Code.
 *
 * TOOL-05 stops at the plumbing: it reports the document's size and nothing else.
 * Parsing, the tree and the real message protocol arrive with HOST-01 / HOST-02.
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

        const post = (): void => {
            void webviewPanel.webview.postMessage({
                type: ExtensionMessageType.documentInfo,
                payload: {
                    fileName: document.uri.path.split('/').pop() ?? document.uri.path,
                    characters: document.getText().length,
                },
            });
        };

        const subscription = webviewPanel.webview.onDidReceiveMessage((message: unknown) => {
            if (!isWebviewMessage(message)) {
                Logger.warn(`Ignored unrecognised webview message: ${JSON.stringify(message)}`);
                return;
            }
            if (message.type === WebviewMessageType.ready) {
                post();
            }
        });

        webviewPanel.onDidDispose(() => {
            subscription.dispose();
        });

        Logger.info(`Opened ${document.uri.toString()} in the XLIFF editor.`);
    }
}

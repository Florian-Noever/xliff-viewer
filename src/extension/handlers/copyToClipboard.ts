import * as vscode from 'vscode';

import type { WebviewMessage, WebviewMessageType } from '../../shared/messages';

type CopyToClipboardMessage = Extract<WebviewMessage, { type: typeof WebviewMessageType.copyToClipboard }>;

/** A webview cannot reach the clipboard under the CSP, so the host does it. */
export function handleCopyToClipboard(message: CopyToClipboardMessage): Promise<void> {
    return Promise.resolve(vscode.env.clipboard.writeText(message.text));
}

import * as vscode from 'vscode';

import { NotifyKind } from '../../shared/messages';

import type { WebviewMessage, WebviewMessageType } from '../../shared/messages';

type NotifyMessage = Extract<WebviewMessage, { type: typeof WebviewMessageType.notify }>;

export function handleNotify(message: NotifyMessage): void {
    switch (message.kind) {
        case NotifyKind.error:
            void vscode.window.showErrorMessage(message.message);
            break;
        case NotifyKind.warning:
            void vscode.window.showWarningMessage(message.message);
            break;
        case NotifyKind.info:
            void vscode.window.showInformationMessage(message.message);
            break;
    }
}

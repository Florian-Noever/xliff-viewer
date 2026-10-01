import * as vscode from 'vscode';

import type { ExtensionMessage } from '../../shared/messages';

/** The smallest template the provider can fill: each placeholder once, and nothing else. */
export const WEBVIEW_TEMPLATE = '<script nonce="%NONCE%" src="%SCRIPT_URI%"></script><link href="%CSS_URI%"><meta content="%CSP_SOURCE%">';

/** A webview panel as the provider sees one, with the controls a test drives it by. */
export interface FakeWebviewPanel {
    readonly panel: vscode.WebviewPanel;
    /** What the extension posted to the webview, in order. */
    readonly posted: ExtensionMessage[];
    /** Delivers a message from the webview to every listener. */
    send(message: unknown): void;
    /** How many message listeners the panel still holds. */
    listening(): number;
    /** Closes the panel. VS Code disposes a panel once, so a second call does nothing. */
    dispose(): void;
}

/** Every subscription it hands out really unsubscribes, so a test can count what is left. */
export function fakeWebviewPanel(): FakeWebviewPanel {
    const posted: ExtensionMessage[] = [];
    const listeners: ((message: unknown) => void)[] = [];
    const disposeHandlers: (() => void)[] = [];
    let closed = false;

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
            onDidReceiveMessage: (listener: (message: unknown) => void) => subscribe(listeners, listener),
        },
        onDidDispose: (handler: () => void) => subscribe(disposeHandlers, handler),
    } as unknown as vscode.WebviewPanel;

    return {
        panel,
        posted,
        send: (message: unknown) => {
            for (const listener of [...listeners]) {
                listener(message);
            }
        },
        listening: () => listeners.length,
        dispose: () => {
            if (closed) {
                return;
            }
            closed = true;
            for (const handler of [...disposeHandlers]) {
                handler();
            }
        },
    };
}

function subscribe<T>(list: T[], item: T): vscode.Disposable {
    list.push(item);
    return new vscode.Disposable(() => {
        const index = list.indexOf(item);
        if (index >= 0) {
            list.splice(index, 1);
        }
    });
}

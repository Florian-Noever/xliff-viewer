import * as vscode from 'vscode';

import { handleCopyToClipboard } from './copyToClipboard';
import { handleNotify } from './notify';
import { handleOpenSource } from './openSource';
import { handleReady } from './ready';
import { handleUpdateState } from './updateState';
import { handleUpdateTarget } from './updateTarget';
import { Logger } from '../services/logger';

import type { HandlerContext } from './handlerContext';
import type { WebviewMessage } from '../../shared/messages';

/**
 * One handler per webview message, and the dispatch that runs them (§8.3, §8.5).
 *
 * `HandlerMap` is keyed by `WebviewMessage['type']`, so **adding a message to the union
 * without writing its handler fails to compile.** That is stronger than the `never` check
 * in a switch default, which only proves the case was considered.
 */

type Handler<K extends WebviewMessage['type']> =
    (message: Extract<WebviewMessage, { type: K }>, context: HandlerContext) => void | Promise<void>;

type HandlerMap = { readonly [K in WebviewMessage['type']]: Handler<K> };

const HANDLERS: HandlerMap = {
    ready: (_message, context) => handleReady(context),
    updateTarget: handleUpdateTarget,
    updateState: handleUpdateState,
    openSource: handleOpenSource,
    copyToClipboard: message => handleCopyToClipboard(message),
    notify: (message) => {
        handleNotify(message);
    },
};

/**
 * Runs a handler and absorbs its failure.
 *
 * A handler that throws must not take the editor down with it: the webview stays mounted,
 * the error is logged and shown, and the next message is still dispatched.
 */
export async function dispatch(message: WebviewMessage, context: HandlerContext): Promise<void> {
    // TypeScript cannot narrow a mapped type's parameter at the call site; the union is
    // still checked at every point that matters, which is where the map is built.
    const handler = HANDLERS[message.type] as (message: WebviewMessage, context: HandlerContext) => void | Promise<void>;

    try {
        await handler(message, context);
    } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : 'unknown error';
        Logger.error(`Handling "${message.type}" failed: ${detail}`, error);
        void vscode.window.showErrorMessage(`XLIFF Viewer: ${detail}`);
    }
}

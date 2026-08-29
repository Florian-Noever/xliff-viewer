import { ExtensionMessageType } from '../../shared/messages';

import type { HandlerContext } from './handlerContext';

/**
 * The webview has mounted and wants the document (§8.3).
 *
 * Settings go first: the view needs `defaultExpandDepth` and `editMode` to render the
 * document it is about to receive, and sending them separately means a later change costs
 * one small message instead of the whole payload.
 */
export function handleReady(context: HandlerContext): void | Promise<void> {
    context.post({ type: ExtensionMessageType.settings, payload: context.settings() });
    return context.session.sendDocument();
}

import { ExtensionMessageType } from '../../shared/messages';

import type { HandlerContext } from './handlerContext';

/**
 * The webview has mounted and wants the document.
 *
 * Settings go first: the view needs `defaultExpandDepth` and `editMode` to render the
 * document it is about to receive.
 */
export function handleReady(context: HandlerContext): void | Promise<void> {
    context.post({ type: ExtensionMessageType.settings, payload: context.settings() });
    return context.view.sendDocument();
}

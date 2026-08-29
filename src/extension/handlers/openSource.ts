import type { HandlerContext } from './handlerContext';

import type { WebviewMessage, WebviewMessageType } from '../../shared/messages';

type OpenSourceMessage = Extract<WebviewMessage, { type: typeof WebviewMessageType.openSource }>;

/** Navigation (§10). `al` is the primary action; `base` and `text` are the fallbacks. */
export function handleOpenSource(message: OpenSourceMessage, context: HandlerContext): void | Promise<void> {
    return context.session.openSource({ fileIndex: message.fileIndex, unitId: message.unitId }, message.target);
}

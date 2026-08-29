import type { HandlerContext } from './handlerContext';

import type { WebviewMessage, WebviewMessageType } from '../../shared/messages';

type OpenSourceMessage = Extract<WebviewMessage, { type: typeof WebviewMessageType.openSource }>;

/**
 * Navigation (§10). `al` is the primary action; `base` and `text` are the fallbacks.
 *
 * A message with no unit means the document itself — the error pane's "Open as text",
 * which has no unit to name (§11.3).
 */
export function handleOpenSource(message: OpenSourceMessage, context: HandlerContext): void | Promise<void> {
    const unit = message.fileIndex !== undefined && message.unitId !== undefined
        ? { fileIndex: message.fileIndex, unitId: message.unitId }
        : undefined;
    return context.session.openSource(message.target, unit);
}

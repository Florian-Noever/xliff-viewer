import type { HandlerContext } from './handlerContext';

import type { WebviewMessage, WebviewMessageType } from '../../shared/messages';

type UpdateStateMessage = Extract<WebviewMessage, { type: typeof WebviewMessageType.updateState }>;

export function handleUpdateState(message: UpdateStateMessage, context: HandlerContext): void | Promise<void> {
    return context.session.updateState({ fileIndex: message.fileIndex, unitId: message.unitId }, message.state);
}

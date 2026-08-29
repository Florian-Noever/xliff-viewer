import type { HandlerContext } from './handlerContext';

import type { WebviewMessage, WebviewMessageType } from '../../shared/messages';

type UpdateTargetMessage = Extract<WebviewMessage, { type: typeof WebviewMessageType.updateTarget }>;

/** Writes a target. An omitted `state` means "let `xliffViewer.stateOnEdit` decide" (§12.1). */
export function handleUpdateTarget(message: UpdateTargetMessage, context: HandlerContext): void | Promise<void> {
    return context.session.updateTarget({ fileIndex: message.fileIndex, unitId: message.unitId }, message.value, message.state);
}

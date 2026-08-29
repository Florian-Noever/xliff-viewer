import type { DocumentSession } from '../editor/documentSession';

import type { ExtensionMessage } from '../../shared/messages';
import type { WebviewSettings } from '../../shared/settings';

/**
 * Everything a message handler is allowed to reach.
 *
 * Its own file so handlers can import it without a cycle through the dispatcher.
 */
export interface HandlerContext {
    readonly post: (message: ExtensionMessage) => void;
    readonly session: DocumentSession;
    /** Read on demand, never captured: settings change while an editor is open. */
    readonly settings: () => WebviewSettings;
}

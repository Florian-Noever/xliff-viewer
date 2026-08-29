import { ExtensionMessageType } from '../../shared/messages';

import type { ExtensionMessage, NavigationTarget } from '../../shared/messages';
import type { XliffState } from '../../shared/state';

/**
 * What the message handlers need from the open document.
 *
 * An interface rather than the class itself so `HOST-01`'s dispatch is testable without a
 * `TextDocument`, and so the handlers depend on the operation rather than on the session
 * that happens to implement it.
 */

/** A unit is identified by its `<file>` **and** its id — XLIFF scopes ids per file (`DEC-028`). */
export interface UnitReference {
    readonly fileIndex: number;
    readonly unitId: string;
}

export interface DocumentSession {
    /** Answers `ready`: parse if needed, then post `setDocument` or `error`. */
    sendDocument(): void | Promise<void>;
    /** An absent `state` means "apply `xliffViewer.stateOnEdit`" (§12.1). */
    updateTarget(unit: UnitReference, value: string, state?: XliffState): void | Promise<void>;
    updateState(unit: UnitReference, state: XliffState): void | Promise<void>;
    openSource(unit: UnitReference, target: NavigationTarget): void | Promise<void>;
}

const NOT_YET = 'The document session arrives with HOST-02.';

/**
 * A session that has no document yet.
 *
 * `HOST-01` builds the protocol, the dispatch and the settings; parsing and the change
 * pipeline are `HOST-02`. Until then an opened file reports that, rather than the editor
 * silently doing nothing. **Delete this when `HOST-02` lands.**
 */
export function createPendingSession(post: (message: ExtensionMessage) => void): DocumentSession {
    const announce = (): void => {
        post({ type: ExtensionMessageType.loading, payload: { message: NOT_YET } });
    };

    return {
        sendDocument: announce,
        updateTarget: announce,
        updateState: announce,
        openSource: announce,
    };
}

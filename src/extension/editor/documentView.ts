import * as vscode from 'vscode';

import { ExtensionMessageType, NavigationTarget } from '../../shared/messages';

import type { DocumentSession, SessionState, XliffDocumentSession } from './documentSession';
import type { ExtensionMessage } from '../../shared/messages';

/**
 * One webview's view of a document session: the same parsed document, posted to one panel.
 *
 * Separate from the session because the two answer different questions. The session knows
 * *what the document is*; a view knows *what this panel has already been told*, which is
 * what decides whether a message needs to carry the document again.
 */

const OPEN_WITH_COMMAND = 'vscode.openWith';
/** VS Code's built-in text editor, which `priority: "default"` keeps reachable (§8.1). */
const DEFAULT_EDITOR = 'default';

/**
 * Answers `ready` for a panel that has nothing yet.
 *
 * Edits and navigation to a unit are not wired — `EDIT-01` and `NAV-02` own them. They
 * throw rather than doing nothing, so an action that should not be reachable yet says so
 * instead of failing silently (§12.5).
 */
export function createDocumentSession(session: XliffDocumentSession, post: (message: ExtensionMessage) => void): DocumentSession {
    const notYet = (what: string, task: string): never => {
        throw new Error(`${what} arrives with ${task}.`);
    };

    return {
        sendDocument: () => {
            post({ type: ExtensionMessageType.loading, payload: { message: 'Reading the translation file…' } });
            postInitialState(session.current(), session, post);
        },
        updateTarget: () => notYet('Editing a target', 'EDIT-01'),
        updateState: () => notYet('Changing a state', 'EDIT-01'),
        openSource: (target, unit) => {
            if (target !== NavigationTarget.text || unit !== undefined) {
                // Revealing a unit needs the id search of §10.2, and `al` / `base` need a
                // resolved base file — both are NAV-02's, not this task's.
                return notYet('Navigating to a unit', 'NAV-02');
            }
            return Promise.resolve(vscode.commands.executeCommand<void>(OPEN_WITH_COMMAND, session.uri, DEFAULT_EDITOR));
        },
    };
}

/**
 * The first state a panel receives.
 *
 * On a failure that follows a good parse the last good document goes first, so a panel
 * opened while the file is broken still has something behind the error pane (§7.7).
 */
function postInitialState(state: SessionState, session: XliffDocumentSession, post: (message: ExtensionMessage) => void): void {
    if (state.kind === 'error') {
        const lastGood = session.lastGoodState();
        if (lastGood !== undefined) {
            post({ type: ExtensionMessageType.setDocument, payload: lastGood.dto });
        }
    }
    postUpdate(state, post);
}

/**
 * A later state, for a panel that is already showing this document.
 *
 * **A failure sends only the failure.** Re-sending the last good document here would put
 * 1.2 MB on the wire for every keystroke that leaves the file unparseable, to redeliver
 * what the panel is already displaying.
 */
export function postUpdate(state: SessionState, post: (message: ExtensionMessage) => void): void {
    post(state.kind === 'document'
        ? { type: ExtensionMessageType.setDocument, payload: state.dto }
        : { type: ExtensionMessageType.error, payload: state.error });
}

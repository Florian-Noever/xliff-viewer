import * as vscode from 'vscode';

import { Logger } from '../services/logger';
import { revealAsText, revealInBaseFile } from '../services/navigation';

import { ExtensionMessageType, NavigationTarget } from '../../shared/messages';

import type { DocumentSession, SessionState, UnitReference, XliffDocumentSession } from './documentSession';
import type { BaseFileResolver } from '../services/baseFileResolver';
import type { ExtensionMessage } from '../../shared/messages';

/**
 * One webview's view of a document session: the same parsed document, posted to one panel.
 *
 * Separate from the session because the two answer different questions. The session knows
 * *what the document is*; a view knows *what this panel has already been told*, which is
 * what decides whether a message needs to carry the document again.
 */

/**
 * Answers `ready` for a panel that has nothing yet.
 *
 * Edits and navigation to a unit are not wired — `EDIT-01` and `NAV-02` own them. They
 * throw rather than doing nothing, so an action that should not be reachable yet says so
 * instead of failing silently (§12.5).
 */
export function createDocumentSession(
    session: XliffDocumentSession,
    post: (message: ExtensionMessage) => void,
    baseFiles?: BaseFileResolver,
): DocumentSession {
    const notYet = (what: string, task: string): never => {
        throw new Error(`${what} arrives with ${task}.`);
    };

    return {
        sendDocument: () => {
            post({ type: ExtensionMessageType.loading, payload: { message: 'Reading the translation file…' } });
            const state = session.current();
            postInitialState(state, session, post);

            // §9.2: resolution is async and must not hold up the document. The webview
            // shows the tree first and learns about the base file when it is known.
            if (baseFiles !== undefined && state.kind === 'document') {
                void announceBaseFile(baseFiles, session, state.dto.isBaseFile, post);
            }
        },
        updateTarget: () => notYet('Editing a target', 'EDIT-01'),
        updateState: () => notYet('Changing a state', 'EDIT-01'),
        openSource: (target, unit) => {
            switch (target) {
                case NavigationTarget.text:
                    return revealAsText(session.uri, unit?.unitId);
                case NavigationTarget.base:
                    return showInBaseFile(baseFiles, session, unit);
                default:
                    // `al` needs the AL-file search of §10.1, which is NAV-04's.
                    return notYet('Navigating to the AL source', 'NAV-04');
            }
        },
    };
}

/**
 * §10.2. Everything that can go wrong here is a normal state, not an error: no resolver,
 * no base file, or a base file that does not carry this unit. Each says so plainly.
 */
async function showInBaseFile(
    baseFiles: BaseFileResolver | undefined,
    session: XliffDocumentSession,
    unit: UnitReference | undefined,
): Promise<void> {
    if (unit === undefined) {
        void vscode.window.showInformationMessage('Choose a unit to show in the base file.');
        return;
    }

    const resolved = await baseFiles?.resolve(session.uri, false);
    if (resolved?.uri === undefined) {
        void vscode.window.showInformationMessage('No base file was found for this translation file.');
        return;
    }

    const found = await revealInBaseFile(resolved.uri, unit.unitId);
    if (!found) {
        void vscode.window.showInformationMessage(`The base file does not contain "${unit.unitId}". It may have been removed since this translation was made.`);
    }
}

/** Posts `baseFile` once resolution finishes. Not finding one is a result, not a failure (§9.2). */
async function announceBaseFile(
    baseFiles: BaseFileResolver,
    session: XliffDocumentSession,
    isBaseFile: boolean,
    post: (message: ExtensionMessage) => void,
): Promise<void> {
    try {
        const resolved = await baseFiles.resolve(session.uri, isBaseFile);
        post({
            type: ExtensionMessageType.baseFile,
            payload: resolved.uri === undefined
                ? null
                : { uri: resolved.uri.toString(), fileName: fileNameOf(resolved.uri) },
        });
    } catch (error: unknown) {
        Logger.warn(`Base-file resolution failed for ${session.uri.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
        post({ type: ExtensionMessageType.baseFile, payload: null });
    }
}

function fileNameOf(uri: vscode.Uri): string {
    return uri.path.slice(uri.path.lastIndexOf('/') + 1);
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

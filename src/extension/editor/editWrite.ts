import * as vscode from 'vscode';

import { Logger } from '../services/logger';
import { readSettings } from '../services/settings';
import { containsComment } from '../xliff/writer';
import { XliffState } from '../../shared/state';

import type { SessionState, XliffDocumentSession } from './documentSession';
import type { TextEditRange } from '../xliff/writer';
import type { UnitReference } from '../../shared/model';

/** The model and the exact text it was parsed from, which the writer needs together. */
export type EditableState = Extract<SessionState, { kind: 'document' }>;

/**
 * What a target's state becomes when its text is edited.
 *
 * Three rules, in this order:
 *
 * 1. **Clearing wins outright.** An empty target cannot be translated, reviewed or signed
 *    off, whatever anybody chose, so it becomes `needs-translation`.
 * 2. **An explicit state is obeyed.** The webview sends one when the reader picked a state
 *    for this unit in this session, which is what `stateOnEdit` is not allowed to overrule.
 * 3. **Otherwise `xliffViewer.stateOnEdit`**, read at edit time so changing it takes effect
 *    without a reload, and already validated down to a spec state by the settings service.
 */
export function stateAfterEdit(session: XliffDocumentSession, value: string, chosen: XliffState | undefined): XliffState {
    if (value === '') {
        return XliffState.needsTranslation;
    }
    return chosen ?? readSettings(session.uri).stateOnEdit;
}

/**
 * The one path that changes a file.
 *
 * Everything it refuses, it refuses **before** touching the model, and says why: a viewer
 * that silently does nothing is worse than one that explains itself.
 */
export async function writeEdit(
    session: XliffDocumentSession,
    unit: UnitReference,
    mutate: (state: EditableState) => TextEditRange | null,
): Promise<void> {
    const state = session.synchronise();

    if (state.kind !== 'document') {
        void vscode.window.showInformationMessage('This file cannot be edited until it parses.');
        return;
    }
    if (state.dto.readOnly) {
        void vscode.window.showInformationMessage(state.dto.isBaseFile
            ? 'This is the base file, which the AL compiler owns. Edit the language file instead.'
            : 'This file is read-only.');
        return;
    }
    // The parser drops comments, so writing this document would delete them. Refusing
    // costs an edit; the alternative costs somebody's comment.
    if (containsComment(state.text)) {
        void vscode.window.showInformationMessage('This file contains XML comments, which this editor does not preserve. Edit it as text instead.');
        return;
    }

    let edit: TextEditRange | null;
    try {
        edit = mutate(state);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'The edit could not be applied.';
        Logger.warn(`Edit to ${unit.unitId} failed: ${message}`);
        void vscode.window.showErrorMessage(message);
        return;
    }

    // `null` is the writer saying the text would not change — a target set to what it
    // already says. Applying an empty edit would dirty the document for nothing.
    if (edit === null) {
        return;
    }

    const applied = await session.applyEdit(edit, unit);

    // Said after the first edit rather than on open: a reader who never edits has nothing
    // to be warned about, and this is only true of a file that gets saved.
    if (applied && session.claimBomWarning()) {
        void vscode.window.showWarningMessage(
            'This file begins with a UTF-8 byte-order mark, which VS Code does not write back when it saves. '
            + 'The translations are unaffected; the first three bytes of the file will change.',
        );
    }
}

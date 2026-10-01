import * as vscode from 'vscode';

import { Logger } from '../services/logger';
import { readSettings } from '../services/settings';
import { rememberTarget } from '../xliff/writer';
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
 * Every refusal says why, leaves the model as the file is, and calls `onRefused`, whose job
 * is to put the saved value back on screen: a viewer that silently keeps what was typed is
 * worse than one that explains itself.
 */
export async function writeEdit(
    session: XliffDocumentSession,
    unit: UnitReference,
    mutate: (state: EditableState) => TextEditRange | null,
    onRefused: () => void,
): Promise<void> {
    const state = session.synchronise();

    if (state.kind !== 'document') {
        void vscode.window.showInformationMessage('This file cannot be edited until it parses.');
        onRefused();
        return;
    }
    if (state.dto.readOnly) {
        void vscode.window.showInformationMessage(state.dto.readOnlyReason ?? 'This file is read-only.');
        onRefused();
        return;
    }

    const restore = rememberTarget(state.model, unit);
    let edit: TextEditRange | null;
    try {
        edit = mutate(state);
    } catch (error: unknown) {
        restore();
        const message = error instanceof Error ? error.message : 'The edit could not be applied.';
        Logger.warn(`Edit to ${unit.unitId} failed: ${message}`);
        void vscode.window.showErrorMessage(message);
        onRefused();
        return;
    }

    // `null` is the writer saying the text would not change — a target set to what it
    // already says. Applying an empty edit would dirty the document for nothing.
    if (edit === null) {
        return;
    }

    // The model already holds the edit; a refusal must take it back out, or the next
    // edit would write this one too.
    if (!await session.applyEdit(edit, unit)) {
        restore();
        void vscode.window.showWarningMessage(
            'The edit could not be applied, so the target shows its saved value again. '
            + 'VS Code refused it, which usually means the file is open read-only.',
        );
        onRefused();
        return;
    }

    // Said after the first edit rather than on open: a reader who never edits has nothing
    // to be warned about, and this is only true of a file that gets saved.
    if (session.claimBomWarning()) {
        void vscode.window.showWarningMessage(
            'This file begins with a UTF-8 byte-order mark, which VS Code does not write back when it saves. '
            + 'The translations are unaffected; the first three bytes of the file will change.',
        );
    }
}

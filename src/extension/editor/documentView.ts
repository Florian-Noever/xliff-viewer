import * as vscode from 'vscode';

import { Logger } from '../services/logger';
import { compareToBase } from '../services/baseFileIndex';
import { revealAsText, revealInBaseFile } from '../services/navigation';
import { readSettings } from '../services/settings';
import { containsComment, setState, setTarget } from '../xliff/writer';

import { XliffState } from '../../shared/state';
import { fileNameOf } from '../services/uriNames';

import { ExtensionMessageType, NavigationTarget } from '../../shared/messages';

import type { DocumentSession, SessionChange, SessionState, UnitReference, XliffDocumentSession } from './documentSession';
import type { TextEditRange } from '../xliff/writer';
import type { BaseFileIndex } from '../services/baseFileIndex';
import type { BaseFileResolver } from '../services/baseFileResolver';
import type { XliffDocumentDto } from '../../shared/dto';
import type { ExtensionMessage } from '../../shared/messages';

/**
 * One webview's view of a document session: the same parsed document, posted to one panel.
 *
 * Separate from the session because the two answer different questions. The session knows
 * *what the document is*; a view knows *what this panel has already been told*, which is
 * what decides whether a message needs to carry the document again.
 */

/** What the panel's own listener needs on top of the message handlers' contract. */
export interface DocumentView extends DocumentSession, vscode.Disposable {
    /**
     * What the panel is told when the document changes.
     *
     * A re-parse re-announces the base file and the pairing markers too, because a
     * `setDocument` replaces the payload they were attached to — leaving them out is how
     * `REVIEW-02a` found the view losing its base file on the first keystroke. Our own
     * edit is one unit and says only that (§8.4).
     */
    apply(change: SessionChange): void;
}

/**
 * Answers `ready` for a panel that has nothing yet.
 *
 * Editing is not wired — `EDIT-01` owns it. It throws rather than doing nothing, so an
 * action that should not be reachable yet says so instead of failing silently (§12.5).
 */
export function createDocumentSession(
    session: XliffDocumentSession,
    post: (message: ExtensionMessage) => void,
    baseFiles?: BaseFileResolver,
    baseIndex?: BaseFileIndex,
): DocumentView {
    const subscriptions: vscode.Disposable[] = [];

    // Which units this panel has been told are orphaned or source-changed, per `<file>`.
    // `patchUnits` can only *set* a marker; clearing one means sending the unit again
    // without it, which needs knowing what was sent (§9.3).
    const marked = new Map<number, ReadonlySet<string>>();

    const announcePairing = (dto: XliffDocumentDto): void => {
        if (baseFiles !== undefined) {
            void announceBaseFile(baseFiles, baseIndex, session, dto, post, marked);
        }
    };

    // The base file is somebody else's artefact: the AL compiler rewrites it while this
    // document stays untouched, and the markers on screen were computed from the old one.
    // The resolver clears its own cache from the same watcher event, and it is constructed
    // first, so by the time this runs both caches are already cold.
    if (baseIndex !== undefined) {
        subscriptions.push(baseIndex.onDidChange(() => {
            const state = session.current();
            if (state.kind === 'document') {
                announcePairing(state.dto);
            }
        }));
    }

    return {
        sendDocument: () => {
            post({ type: ExtensionMessageType.loading, payload: { message: 'Reading the translation file…' } });
            const state = session.current();
            postInitialState(state, session, post);

            // §9.2: resolution is async and must not hold up the document. The webview
            // shows the tree first and learns about the base file when it is known.
            if (state.kind === 'document') {
                announcePairing(state.dto);
            }
        },
        dispose: () => {
            for (const subscription of subscriptions) {
                subscription.dispose();
            }
            subscriptions.length = 0;
        },
        apply: (change) => {
            if (change.kind === 'patched') {
                post({ type: ExtensionMessageType.patchUnits, payload: { fileIndex: change.fileIndex, units: change.units } });
                return;
            }
            postUpdate(change.state, post);
            if (change.state.kind === 'document') {
                announcePairing(change.state.dto);
            }
        },
        updateTarget: (unit, value, state) => write(session, unit, edit => setTarget(edit.model, edit.text, {
            unitId: unit.unitId,
            value,
            state: stateAfterEdit(session, value, state),
        })),
        updateState: (unit, state) => write(session, unit, edit => setState(edit.model, edit.text, unit.unitId, state)),
        // Two targets since `DEC-032`: the unit's own "Go to source", and the raw XML for
        // the error pane, which has no unit to name (§11.3).
        openSource: (target, unit) => (target === NavigationTarget.base
            ? showInBaseFile(baseFiles, session, unit)
            : revealAsText(session.uri, unit?.unitId)),
    };
}

/**
 * What a target's state becomes when its text is edited (§12.3).
 *
 * Three rules, in this order:
 *
 * 1. **Clearing wins outright.** An empty target cannot be translated, reviewed or signed
 *    off, whatever anybody chose, so it becomes `needs-translation`. §12.3 states this
 *    without an exception and it is the one that cannot be argued with.
 * 2. **An explicit state is obeyed.** The webview sends one when the reader picked a state
 *    for this unit in this session, which is what `stateOnEdit` is not allowed to overrule.
 * 3. **Otherwise `xliffViewer.stateOnEdit`**, read at edit time so changing it takes effect
 *    without a reload, and already validated down to a spec state by the settings service.
 */
function stateAfterEdit(session: XliffDocumentSession, value: string, chosen: XliffState | undefined): XliffState {
    if (value === '') {
        return XliffState.needsTranslation;
    }
    return chosen ?? readSettings(session.uri).stateOnEdit;
}

/** The model and the exact text it was parsed from, which the writer needs together (§7.6). */
type EditableState = Extract<SessionState, { kind: 'document' }>;

/**
 * The one path that changes a file (MASTER_PLAN §12.1).
 *
 * Everything it refuses, it refuses **before** touching the model, and says why: a viewer
 * that silently does nothing is worse than one that explains itself (§12.5).
 */
async function write(
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
    // `DEC-038`: the parser drops comments, so writing this document would delete them.
    // Refusing costs an edit; the alternative costs somebody's comment.
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
    // already says. Applying an empty edit would dirty the document for nothing (§7.6).
    if (edit === null) {
        return;
    }

    const applied = await session.applyEdit(edit, unit);

    // Said after the first edit rather than on open: a reader who never edits has nothing
    // to be warned about, and this is only true of a file that gets saved (`EDIT-01a`).
    if (applied && session.claimBomWarning()) {
        void vscode.window.showWarningMessage(
            'This file begins with a UTF-8 byte-order mark, which VS Code does not write back when it saves. '
            + 'The translations are unaffected; the first three bytes of the file will change.',
        );
    }
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

    const state = session.current();
    if (state.kind === 'document' && state.dto.isBaseFile) {
        // Resolving a base file's base file would find the document itself (§9.2).
        void vscode.window.showInformationMessage('This file is the base file.');
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
    baseIndex: BaseFileIndex | undefined,
    session: XliffDocumentSession,
    dto: XliffDocumentDto,
    post: (message: ExtensionMessage) => void,
    marked: Map<number, ReadonlySet<string>>,
): Promise<void> {
    let resolved;
    try {
        resolved = await baseFiles.resolve(session.uri, dto.isBaseFile);
    } catch (error: unknown) {
        Logger.warn(`Base-file resolution failed for ${session.uri.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
        post({ type: ExtensionMessageType.baseFile, payload: null });
        return;
    }

    post({
        type: ExtensionMessageType.baseFile,
        payload: resolved.uri === undefined
            ? null
            : { uri: resolved.uri.toString(), fileName: fileNameOf(resolved.uri) },
    });

    // No base file is an answer too: whatever was marked against the old one is no longer
    // something we can claim, so the markers come off.
    const sources = resolved.uri === undefined || baseIndex === undefined
        ? new Map<string, string>()
        : await baseIndex.sourcesOf(resolved.uri);

    announceStaleUnits(sources, dto, post, marked);
}

/**
 * Marks the units the base file no longer agrees with, and unmarks the ones it now does
 * (§9.3).
 *
 * Sent as `patchUnits` rather than a fresh `setDocument`: a language file in step with its
 * base produces nothing at all, and one that has drifted produces only the units that
 * drifted. Re-sending the whole document to mark three of them would cost 773 KB.
 *
 * An **empty** `sources` map means there is nothing to compare against — no base file, or
 * one that could not be read. That unmarks rather than freezing what was marked before:
 * `compareToBase` against nothing would call every unit orphaned, which is the one wrong
 * answer worth guarding against.
 */
function announceStaleUnits(
    sources: ReadonlyMap<string, string>,
    dto: XliffDocumentDto,
    post: (message: ExtensionMessage) => void,
    marked: Map<number, ReadonlySet<string>>,
): void {
    for (const file of dto.files) {
        const differences = sources.size === 0 ? [] : compareToBase(file.units, sources);
        const byId = new Map(file.units.map(unit => [unit.id, unit]));

        const nowMarked = new Set(differences.map(difference => difference.id));
        const previously = marked.get(file.index) ?? EMPTY;
        marked.set(file.index, nowMarked);

        const set = differences.flatMap((difference) => {
            const unit = byId.get(difference.id);
            return unit === undefined ? [] : [{ ...unit, orphaned: difference.orphaned, baseSource: difference.baseSource }];
        });
        // The DTO's own unit carries no markers, so sending it again is how one comes off.
        const cleared = [...previously]
            .filter(id => !nowMarked.has(id))
            .flatMap((id) => {
                const unit = byId.get(id);
                return unit === undefined ? [] : [unit];
            });

        if (set.length === 0 && cleared.length === 0) {
            continue;
        }

        Logger.info(`<file> ${file.index}: ${set.length} of ${file.units.length} units differ from the base file, ${cleared.length} no longer do.`);
        post({ type: ExtensionMessageType.patchUnits, payload: { fileIndex: file.index, units: [...set, ...cleared] } });
    }
}

const EMPTY: ReadonlySet<string> = new Set();

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
function postUpdate(state: SessionState, post: (message: ExtensionMessage) => void): void {
    post(state.kind === 'document'
        ? { type: ExtensionMessageType.setDocument, payload: state.dto }
        : { type: ExtensionMessageType.error, payload: state.error });
}

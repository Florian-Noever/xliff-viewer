import * as vscode from 'vscode';

import { BasePairing } from './basePairing';
import { stateAfterEdit, writeEdit } from './editWrite';
import { goToSource } from '../services/goToSource';
import { Logger } from '../services/logger';
import { revealAsText } from '../services/navigation';
import { generatorNote } from '../xliff/names';
import { setState, setTarget } from '../xliff/writer';
import { ExtensionMessageType, NavigationTarget } from '../../shared/messages';
import { findUnit } from '../../shared/model';

import type { SessionChange, SessionState, XliffDocumentSession } from './documentSession';
import type { AlIndexLease, AlSourceIndexes } from '../services/alSourceIndex';
import type { BaseFileIndex } from '../services/baseFileIndex';
import type { BaseFileResolver } from '../services/baseFileResolver';
import type { ExtensionMessage } from '../../shared/messages';
import type { UnitReference } from '../../shared/model';
import type { XliffState } from '../../shared/state';

/** What the message handlers need from the open document. An interface, so dispatch is testable without a `TextDocument`. */
export interface DocumentView {
    /** Answers `ready`: post `loading`, then `setDocument` or `error`. */
    sendDocument(): void | Promise<void>;
    /** An absent `state` means "apply `xliffViewer.stateOnEdit`". */
    updateTarget(unit: UnitReference, value: string, state?: XliffState): void | Promise<void>;
    updateState(unit: UnitReference, state: XliffState): void | Promise<void>;
    /** Without a unit the document itself is opened — the error pane's "Open as text". */
    openSource(target: NavigationTarget, unit?: UnitReference): void | Promise<void>;
}

/** The provider's shared services. Each is optional, so a view can be built with only what it needs. */
export interface DocumentServices {
    readonly baseFiles?: BaseFileResolver;
    readonly baseIndex?: BaseFileIndex;
    readonly alSources?: AlSourceIndexes;
}

/**
 * One webview's view of a document session: the same parsed document, posted to one panel.
 *
 * Separate from the session because the two answer different questions. The session knows
 * *what the document is*; a view knows *what this panel has already been told*, which is
 * what decides whether a message needs to carry the document again.
 */
export class XliffDocumentView implements DocumentView, vscode.Disposable {
    private readonly session: XliffDocumentSession;
    private readonly post: (message: ExtensionMessage) => void;
    private readonly baseFiles: BaseFileResolver | undefined;
    private readonly alSources: AlSourceIndexes | undefined;
    private readonly pairing: BasePairing | undefined;
    private readonly alLease: Promise<AlIndexLease | undefined> | undefined;
    private readonly subscriptions: vscode.Disposable[] = [];
    private disposed = false;
    private alQuestions = 0;

    public constructor(session: XliffDocumentSession, post: (message: ExtensionMessage) => void, services: DocumentServices = {}) {
        this.session = session;
        this.post = post;
        this.baseFiles = services.baseFiles;
        this.alSources = services.alSources;
        this.pairing = services.baseFiles === undefined
            ? undefined
            : new BasePairing(session, post, services.baseFiles, services.baseIndex);

        // Whether there is AL source to go to is a fact about the app, not the document: it is
        // told once per `ready`, and again only when the app's AL files come or go. Holding the
        // lease keeps the app's index alive while this panel is open.
        this.alLease = services.alSources?.acquire(session.uri);
        void this.alLease?.then((lease) => {
            if (lease === undefined) {
                return;
            }
            if (this.disposed) {
                lease.release();
                return;
            }
            this.subscriptions.push(
                lease.index.onDidChangeFiles(() => {
                    this.announceAl();
                }),
                new vscode.Disposable(() => {
                    lease.release();
                }),
            );
        });
    }

    /** Answers `ready` for a panel that has nothing yet. */
    public sendDocument(): void {
        this.post({ type: ExtensionMessageType.loading, payload: { message: 'Reading the translation file…' } });
        const state = this.session.current();
        postInitialState(state, this.session, this.post);

        // Resolution is async and must not hold up the document. The webview shows
        // the tree first and learns about the base file when it is known.
        if (state.kind === 'document') {
            this.pairing?.announce();
        }
        this.announceAl();
    }

    /**
     * What the panel is told when the document changes.
     *
     * A re-parse re-announces the base file and the pairing markers too, because a
     * `setDocument` replaces the payload they were attached to, and the view would otherwise
     * lose its base file on the first keystroke. Our own edit is one unit and says only that.
     */
    public apply(change: SessionChange): void {
        if (change.kind === 'patched') {
            const units = change.units.map(unit => this.pairing?.withMarkers(change.fileIndex, unit) ?? unit);
            this.post({ type: ExtensionMessageType.patchUnits, payload: { fileIndex: change.fileIndex, units } });
            return;
        }
        postUpdate(change.state, this.post);
        if (change.state.kind === 'document') {
            this.pairing?.announce();
        }
    }

    public updateTarget(unit: UnitReference, value: string, state?: XliffState): Promise<void> {
        return writeEdit(this.session, unit, edit => setTarget(edit.model, edit.text, {
            fileIndex: unit.fileIndex,
            unitId: unit.unitId,
            value,
            state: stateAfterEdit(this.session, value, state),
        }), () => {
            this.resendUnit(unit);
        });
    }

    public updateState(unit: UnitReference, state: XliffState): Promise<void> {
        return writeEdit(this.session, unit, edit => setState(edit.model, edit.text, unit, state), () => {
            this.resendUnit(unit);
        });
    }

    /** Two targets: the unit's own "Go to source", and the raw XML for the error pane, which has no unit to name. */
    public openSource(target: NavigationTarget, unit?: UnitReference): Promise<void> {
        return target === NavigationTarget.source
            ? showSource(this.session, unit, this.alSources, this.baseFiles)
            : revealAsText(this.session.uri, unit?.unitId);
    }

    public dispose(): void {
        this.disposed = true;
        this.pairing?.dispose();
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions.length = 0;
    }

    /**
     * Sends one unit again as this panel should show it. The webview replaces the unit, which
     * puts a field the reader typed into back to the saved value.
     */
    private resendUnit(unit: UnitReference): void {
        const current = this.session.current();
        const parsed = current.kind === 'document' ? current : this.session.lastGoodState();
        const saved = parsed?.dto.files
            .find(file => file.index === unit.fileIndex)?.units
            .find(each => each.id === unit.unitId);
        if (saved === undefined) {
            return;
        }
        this.post({
            type: ExtensionMessageType.patchUnits,
            payload: { fileIndex: unit.fileIndex, units: [this.pairing?.withMarkers(unit.fileIndex, saved) ?? saved] },
        });
    }

    /** Answers can overtake each other, so only the answer to the latest question is posted. */
    private announceAl(): void {
        if (this.alLease === undefined) {
            return;
        }
        const question = ++this.alQuestions;
        void hasAlSource(this.alLease, this.session).then((available) => {
            if (question === this.alQuestions && !this.disposed) {
                this.post({ type: ExtensionMessageType.alSource, payload: { available } });
            }
        });
    }
}

/**
 * A unit's "Go to source".
 *
 * The note and `al-object-target` come from the model rather than the message: the host has
 * the file's own note, where the webview only has one rebuilt from the tree. A document that
 * stopped parsing still answers from its last good parse, which is what the panel shows.
 */
async function showSource(
    session: XliffDocumentSession,
    unit: UnitReference | undefined,
    alSources: AlSourceIndexes | undefined,
    baseFiles: BaseFileResolver | undefined,
): Promise<void> {
    if (unit === undefined) {
        void vscode.window.showInformationMessage('Choose a unit to go to its source.');
        return;
    }

    const current = session.current();
    const parsed = current.kind === 'document' ? current : session.lastGoodState();
    const modelUnit = parsed === undefined ? undefined : findUnit(parsed.model, unit);

    await goToSource({
        document: session.uri,
        isBaseFile: parsed?.dto.isBaseFile ?? false,
        unitId: unit.unitId,
        generatorNote: modelUnit === undefined ? undefined : generatorNote(modelUnit),
        alObjectTarget: modelUnit?.alObjectTarget,
    }, alSources, baseFiles);
}

/** Whether the app has AL files at all. Having none is an answer, not a failure. */
async function hasAlSource(alLease: Promise<AlIndexLease | undefined>, session: XliffDocumentSession): Promise<boolean> {
    try {
        return await (await alLease)?.index.hasAlFiles() ?? false;
    } catch (error: unknown) {
        Logger.warn(`Looking for AL source failed for ${session.uri.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
        return false;
    }
}

/**
 * The first state a panel receives.
 *
 * On a failure that follows a good parse the last good document goes first, so a panel
 * opened while the file is broken still has something behind the error pane.
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
 * the whole document on the wire for every keystroke that leaves the file unparseable, to
 * redeliver what the panel is already displaying.
 */
function postUpdate(state: SessionState, post: (message: ExtensionMessage) => void): void {
    post(state.kind === 'document'
        ? { type: ExtensionMessageType.setDocument, payload: state.dto }
        : { type: ExtensionMessageType.error, payload: state.error });
}

import * as vscode from 'vscode';

import { projectDocument } from '../xliff/dto';
import { XliffParseError } from '../xliff/errors';
import { parseXliff } from '../xliff/parser';
import { validateStructure } from '../xliff/validate';
import { Logger } from '../services/logger';

import { ExtensionMessageType } from '../../shared/messages';

import type { XliffDocumentDto } from '../../shared/dto';
import type { ErrorPayload, ExtensionMessage, NavigationTarget } from '../../shared/messages';
import type { XliffDocument } from '../../shared/model';
import type { XliffState } from '../../shared/state';

/**
 * One session per open document, owning the parsed model and the payload built from it
 * (MASTER_PLAN §8.2).
 *
 * Per **document**, not per editor: VS Code allows two editors on one `TextDocument`, and
 * a session each would parse the same 1.3 MB twice on every keystroke. Views attach and
 * detach; the last one out disposes the session.
 */

/** Long enough to swallow a burst of typing, short enough that a paste feels immediate. */
const REPARSE_DEBOUNCE_MS = 150;

/** A unit is identified by its `<file>` **and** its id — XLIFF scopes ids per file (`DEC-028`). */
export interface UnitReference {
    readonly fileIndex: number;
    readonly unitId: string;
}

/** What the message handlers need from the open document. An interface, so dispatch is testable without a `TextDocument`. */
export interface DocumentSession {
    /** Answers `ready`: post `loading`, then `setDocument` or `error`. */
    sendDocument(): void | Promise<void>;
    /** An absent `state` means "apply `xliffViewer.stateOnEdit`" (§12.1). */
    updateTarget(unit: UnitReference, value: string, state?: XliffState): void | Promise<void>;
    updateState(unit: UnitReference, state: XliffState): void | Promise<void>;
    openSource(unit: UnitReference, target: NavigationTarget): void | Promise<void>;
}

export type SessionState =
    | { readonly kind: 'document'; readonly model: XliffDocument; readonly dto: XliffDocumentDto }
    | { readonly kind: 'error'; readonly error: ErrorPayload };

type StateListener = (state: SessionState) => void;

export class XliffDocumentSession {
    private readonly textDocument: vscode.TextDocument;
    private readonly subscription: vscode.Disposable;
    private readonly listeners = new Set<StateListener>();

    private state: SessionState | undefined;
    /** The last successful parse, kept so a mid-edit syntax error does not blank the view (§7.7). */
    private lastGood: Extract<SessionState, { kind: 'document' }> | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;

    public constructor(textDocument: vscode.TextDocument) {
        this.textDocument = textDocument;
        this.subscription = vscode.workspace.onDidChangeTextDocument((event) => {
            this.onDocumentChanged(event);
        });
    }

    public get uri(): vscode.Uri {
        return this.textDocument.uri;
    }

    /** Parses on first use and caches; a re-parse is driven by the change event, not by callers. */
    public current(): SessionState {
        this.state ??= this.parse();
        return this.state;
    }

    /** The newest successful parse, which may predate a failing edit. */
    public lastGoodState(): Extract<SessionState, { kind: 'document' }> | undefined {
        return this.lastGood;
    }

    public attach(listener: StateListener): vscode.Disposable {
        this.listeners.add(listener);
        return new vscode.Disposable(() => this.listeners.delete(listener));
    }

    public get viewCount(): number {
        return this.listeners.size;
    }

    public dispose(): void {
        this.clearTimer();
        this.subscription.dispose();
        this.listeners.clear();
        this.state = undefined;
        this.lastGood = undefined;
    }

    private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        // Fires for every open document in the window, ours included.
        if (event.document.uri.toString() !== this.textDocument.uri.toString()) {
            return;
        }
        // A dirty-state or language change carries no content change and needs no re-parse.
        if (event.contentChanges.length === 0) {
            return;
        }

        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.reparse();
        }, REPARSE_DEBOUNCE_MS);
    }

    private reparse(): void {
        this.state = this.parse();
        for (const listener of [...this.listeners]) {
            listener(this.state);
        }
    }

    private parse(): SessionState {
        const started = Date.now();
        try {
            const model = parseXliff(this.textDocument.getText());
            validateStructure(model);

            const state = { kind: 'document', model, dto: this.project(model) } as const;
            this.lastGood = state;
            Logger.info(`Parsed ${this.fileName()} in ${Date.now() - started} ms: ${state.dto.files.length} file(s).`);
            return state;
        } catch (error: unknown) {
            const payload = toErrorPayload(error);
            Logger.warn(`Could not parse ${this.fileName()}: ${payload.message}`);
            return { kind: 'error', error: payload };
        }
    }

    private project(model: XliffDocument): XliffDocumentDto {
        return projectDocument(model, {
            uri: this.textDocument.uri.toString(),
            fileName: this.fileName(),
            // A base file is read-only by `DEC-011`; so is anything on a file system that
            // will not take a write, which the projection cannot see for itself (§12.5).
            readOnly: this.isWritable() ? undefined : true,
        });
    }

    private isWritable(): boolean {
        // `undefined` means "no opinion", which VS Code treats as writable.
        return vscode.workspace.fs.isWritableFileSystem(this.textDocument.uri.scheme) !== false;
    }

    private fileName(): string {
        const path = this.textDocument.uri.path;
        return path.slice(path.lastIndexOf('/') + 1);
    }

    private clearTimer(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}

function toErrorPayload(error: unknown): ErrorPayload {
    if (error instanceof XliffParseError) {
        return { message: error.displayMessage, line: error.line, col: error.col };
    }
    return { message: error instanceof Error ? error.message : 'The document could not be read.' };
}

/**
 * The per-view face of a session: the same parsed document, posted to one webview.
 *
 * Edits and navigation are not wired yet — `EDIT-01` and `NAV-02` own them. They throw
 * rather than doing nothing, so a wired-up button that should not exist yet says so
 * instead of failing silently (§12.5).
 */
export function createDocumentSession(session: XliffDocumentSession, post: (message: ExtensionMessage) => void): DocumentSession {
    const notYet = (what: string, task: string): never => {
        throw new Error(`${what} arrives with ${task}.`);
    };

    return {
        sendDocument: () => {
            post({ type: ExtensionMessageType.loading, payload: { message: 'Reading the translation file…' } });
            postState(session.current(), session, post);
        },
        updateTarget: () => notYet('Editing a target', 'EDIT-01'),
        updateState: () => notYet('Changing a state', 'EDIT-01'),
        openSource: () => notYet('Navigation', 'NAV-02'),
    };
}

/**
 * Posts one state to one view.
 *
 * On a failure that follows a good parse the last good document goes first, so a view
 * that opened mid-error still has something to show behind the error pane (§7.7).
 */
export function postState(state: SessionState, session: XliffDocumentSession, post: (message: ExtensionMessage) => void): void {
    if (state.kind === 'document') {
        post({ type: ExtensionMessageType.setDocument, payload: state.dto });
        return;
    }

    const lastGood = session.lastGoodState();
    if (lastGood !== undefined) {
        post({ type: ExtensionMessageType.setDocument, payload: lastGood.dto });
    }
    post({ type: ExtensionMessageType.error, payload: state.error });
}

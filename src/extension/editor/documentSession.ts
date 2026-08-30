import * as vscode from 'vscode';

import { projectDocument } from '../xliff/dto';
import { XliffParseError } from '../xliff/errors';
import { parseXliff } from '../xliff/parser';
import { validateStructure } from '../xliff/validate';
import { Logger } from '../services/logger';
import { fileNameOf } from '../services/uriNames';

import type { TextEditRange } from '../xliff/writer';
import type { XliffDocumentDto } from '../../shared/dto';
import type { ErrorPayload, NavigationTarget } from '../../shared/messages';
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
    /** Without a unit the document itself is opened — the error pane's "Open as text" (§11.3). */
    openSource(target: NavigationTarget, unit?: UnitReference): void | Promise<void>;
}

export type SessionState =
    | {
        readonly kind: 'document';
        readonly model: XliffDocument;
        readonly dto: XliffDocumentDto;
        /**
         * The exact text the model was parsed from.
         *
         * Carried with the model rather than fetched separately, because the writer trims
         * its edit against whatever text it is handed: give it text the model did not come
         * from and the edit lands at the wrong offsets and eats content. `REVIEW-01` found
         * that the writer cannot detect this for itself — a legitimately non-AL-formatted
         * file also fails a "does this re-serialise to that" check (`DEC-017`).
         */
        readonly text: string;
    }
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

    /**
     * The state to write against: re-parsed first when the document has moved on since the
     * model was built (§7.6).
     *
     * A re-parse is debounced by 150 ms, so between a keystroke and that timer the cached
     * model describes text that no longer exists. Editing against it is exactly the
     * corruption `REVIEW-01` pinned, so the write path asks for this rather than `current`.
     */
    public synchronise(): SessionState {
        const state = this.current();
        if (state.kind === 'document' && state.text === this.textDocument.getText()) {
            return state;
        }
        this.clearTimer();
        this.state = this.parse();
        return this.state;
    }

    /**
     * Turns the writer's character range into a `WorkspaceEdit` and applies it (§12.1).
     *
     * **Never `workspace.fs`**: going through the editor is what gives the edit dirty
     * state, undo, redo, save and hot exit for free (`DEC-001`). `positionAt` reads the
     * document's current text, so the offsets are converted here and now rather than
     * carried around.
     */
    public async applyEdit(edit: TextEditRange): Promise<boolean> {
        const range = new vscode.Range(
            this.textDocument.positionAt(edit.start),
            this.textDocument.positionAt(edit.end),
        );
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(this.textDocument.uri, range, edit.newText);

        const applied = await vscode.workspace.applyEdit(workspaceEdit);
        if (!applied) {
            Logger.warn(`The edit to ${this.fileName()} was refused by the editor.`);
        }
        return applied;
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
        const text = this.textDocument.getText();
        try {
            const model = parseXliff(text);
            validateStructure(model);

            const state = { kind: 'document', model, dto: this.project(model), text } as const;
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
        return fileNameOf(this.textDocument.uri);
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

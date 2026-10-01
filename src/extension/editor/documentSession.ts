import * as vscode from 'vscode';

import { projectDocument, projectUnit } from '../xliff/dto';
import { findUnit } from '../../shared/model';
import { XliffParseError } from '../xliff/errors';
import { parseXliff } from '../xliff/parser';
import { validateStructure } from '../xliff/validate';
import { Logger } from '../services/logger';
import { fileNameOf } from '../services/uriNames';

import type { TextEditRange } from '../xliff/writer';
import type { TransUnitDto, XliffDocumentDto } from '../../shared/dto';
import type { ErrorPayload } from '../../shared/messages';
import type { UnitReference, XliffDocument } from '../../shared/model';

/**
 * One session per open document, owning the parsed model and the payload built from it.
 *
 * Per **document**, not per editor: VS Code allows two editors on one `TextDocument`, and
 * a session each would parse the same text twice on every keystroke. Views attach and
 * detach; the last one out disposes the session.
 */

/** Long enough to swallow a burst of typing, short enough that a paste feels immediate. */
const REPARSE_DEBOUNCE_MS = 150;

/** What VS Code calls a UTF-8 file that starts with a byte-order mark. */
const BOM_ENCODING = 'utf8bom';

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
         * from and the edit lands at the wrong offsets and eats content. The writer cannot
         * detect this for itself — a legitimately non-AL-formatted file also fails a "does
         * this re-serialise to that" check.
         */
        readonly text: string;
    }
    | { readonly kind: 'error'; readonly error: ErrorPayload };

/**
 * What a view is told when the document changes.
 *
 * Two kinds, because the answer to "the user typed in another editor" and "we just wrote
 * the target they were editing" are not the same message. The first is a new document; the
 * second is one unit, and re-sending the document for it is what costs the view its focus,
 * its scroll and its expansion.
 */
export type SessionChange =
    | { readonly kind: 'parsed'; readonly state: SessionState }
    | { readonly kind: 'patched'; readonly fileIndex: number; readonly units: readonly TransUnitDto[] };

type StateListener = (change: SessionChange) => void;

/**
 * An edit this session asked for and has not yet seen come back.
 *
 * Recognised by the **whole text** the document holds once it has landed. Not by the change
 * spans: VS Code may report one replacement as several smaller changes. Never a timer and
 * never a bare boolean: either would swallow an edit that somebody else made in the same
 * tick, which is precisely the event that must not be lost.
 */
interface PendingEdit extends UnitReference {
    readonly expectedText: string;
}

export class XliffDocumentSession {
    private readonly textDocument: vscode.TextDocument;
    private readonly subscription: vscode.Disposable;
    private readonly listeners = new Set<StateListener>();

    private state: SessionState | undefined;
    private pending: PendingEdit | undefined;
    private bomWarned = false;
    /** The last successful parse, kept so a mid-edit syntax error does not blank the view. */
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
     * model was built.
     *
     * A re-parse waits `REPARSE_DEBOUNCE_MS`, so between a keystroke and that timer the
     * cached model describes text that no longer exists. An edit computed against it lands
     * at the wrong offsets, so the write path asks for this rather than `current`.
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
     * True the first time this document is edited while the editor will drop its BOM, and
     * false ever after.
     *
     * Per **document** rather than per view, because two editors on one file are one file:
     * the reader should hear this once, not once each. `TextDocument.encoding` is readonly,
     * so saying so is the whole of what an extension can do about it.
     */
    public claimBomWarning(): boolean {
        if (this.bomWarned || this.textDocument.encoding !== BOM_ENCODING) {
            return false;
        }
        this.bomWarned = true;
        return true;
    }

    /**
     * Turns the writer's character range into a `WorkspaceEdit` and applies it.
     *
     * **Never `workspace.fs`**: going through the editor is what gives the edit dirty
     * state, undo, redo, save and hot exit for free. `positionAt` reads the document's
     * current text, so the offsets are converted here and now rather than carried around.
     */
    public async applyEdit(edit: TextEditRange, unit: UnitReference): Promise<boolean> {
        // Recorded before the edit is applied, because the change event can arrive during
        // the await.
        const before = this.textDocument.getText();
        this.pending = {
            fileIndex: unit.fileIndex,
            unitId: unit.unitId,
            expectedText: before.slice(0, edit.start) + edit.newText + before.slice(edit.end),
        };

        const range = new vscode.Range(
            this.textDocument.positionAt(edit.start),
            this.textDocument.positionAt(edit.end),
        );
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(this.textDocument.uri, range, edit.newText);

        const applied = await this.request(workspaceEdit);
        if (!applied) {
            this.pending = undefined;
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
        if (this.absorbOwnEdit()) {
            return;
        }

        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.reparse();
        }, REPARSE_DEBOUNCE_MS);
    }

    /**
     * Consumes the pending edit when this event **is** that edit, and answers with a patch.
     *
     * The model was already mutated by the writer, so all that is stale is the text it was
     * parsed from and the one unit in the payload. Both are corrected here rather than by
     * re-parsing the whole document to learn what we already know.
     */
    private absorbOwnEdit(): boolean {
        const pending = this.pending;
        if (pending?.expectedText !== this.textDocument.getText()) {
            return false;
        }

        // Consumed exactly once: the same change again is somebody else's. A re-parse that an
        // earlier part of this same edit scheduled has nothing left to learn.
        this.pending = undefined;
        this.clearTimer();

        const state = this.state;
        if (state?.kind !== 'document') {
            return false;
        }

        const unit = findUnit(state.model, pending);
        if (unit === undefined) {
            return false;
        }

        const patched = projectUnit(unit, state.model.files[pending.fileIndex].targetLanguage);
        this.state = { ...state, text: pending.expectedText, dto: withUnit(state.dto, pending.fileIndex, patched) };
        this.lastGood = this.state;

        this.announce({ kind: 'patched', fileIndex: pending.fileIndex, units: [patched] });
        return true;
    }

    /** `workspace.applyEdit`, with a rejection read as the refusal it is. */
    private async request(edit: vscode.WorkspaceEdit): Promise<boolean> {
        try {
            const applied = await vscode.workspace.applyEdit(edit);
            if (!applied) {
                Logger.warn(`The edit to ${this.fileName()} was refused by the editor.`);
            }
            return applied;
        } catch (error: unknown) {
            Logger.warn(`The edit to ${this.fileName()} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
            return false;
        }
    }

    private reparse(): void {
        // Anything still pending was overtaken by a change that was not it.
        this.pending = undefined;
        this.state = this.parse();
        this.announce({ kind: 'parsed', state: this.state });
    }

    private announce(change: SessionChange): void {
        for (const listener of [...this.listeners]) {
            listener(change);
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
            // A base file is always read-only; so is anything on a file system that will not
            // take a write, which the projection cannot see for itself.
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

/** The same document with one unit replaced. Shallow throughout: nothing else moved. */
function withUnit(dto: XliffDocumentDto, fileIndex: number, unit: TransUnitDto): XliffDocumentDto {
    return {
        ...dto,
        files: dto.files.map(file => (file.index === fileIndex
            ? { ...file, units: file.units.map(each => (each.id === unit.id ? unit : each)) }
            : file)),
    };
}

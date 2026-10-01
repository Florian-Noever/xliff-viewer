/** Text documents: positions in them, the ones open in the editor, edits to them and the changes they report. */

import { Disposable } from './events';
import { recordFileRead, virtualFile } from './fileSystem';
import { Uri } from './uri';

export class Position {
    public readonly line: number;
    public readonly character: number;

    public constructor(line: number, character: number) {
        this.line = line;
        this.character = character;
    }
}

export class Range {
    public readonly start: Position;
    public readonly end: Position;

    public constructor(start: Position, end: Position) {
        this.start = start;
        this.end = end;
    }
}

export class Selection {
    public readonly anchor: Position;
    public readonly active: Position;

    public constructor(anchor: Position, active: Position) {
        this.anchor = anchor;
        this.active = active;
    }
}

/** Line and character of an offset, the way a `TextDocument` counts them. */
function positionIn(text: string, offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, text.length));
    const before = text.slice(0, clamped);
    const line = before.split('\n').length - 1;
    return new Position(line, clamped - (before.lastIndexOf('\n') + 1));
}

/** What VS Code reports for one replaced span; a session matches these against its own edit. */
export interface ContentChange {
    readonly rangeOffset: number;
    readonly rangeLength: number;
    readonly text: string;
}

export interface TextDocumentChangeEvent {
    readonly document: { readonly uri: Uri };
    readonly contentChanges: readonly ContentChange[];
}

export interface EditRecord {
    readonly uri: string;
    readonly range: Range;
    readonly newText: string;
}

let documentChangeListeners: ((event: TextDocumentChangeEvent) => void)[] = [];
let appliedEdits: EditRecord[] = [];
let applyEditResult: boolean | Error = true;
let editsInPieces = false;
/** The documents open in the editor, by URI: what `textDocuments` lists and `applyEdit` writes to. */
const openDocuments = new Map<string, FakeTextDocument>();

/** Enough of a `TextDocument` for a session: an identity and its text. Made, it is open. */
export class FakeTextDocument {
    public readonly uri: Uri;
    /** What the editor detected on read. The session warns that a save drops a `utf8bom` BOM. */
    public encoding: string;
    private text: string;

    public constructor(path: string, text: string, encoding = 'utf8') {
        this.uri = Uri.file(path);
        this.text = text;
        this.encoding = encoding;
        openDocuments.set(this.uri.toString(), this);
    }

    /**
     * Replaces a range and reports it, the way the editor does — so a session under test
     * sees its own edit arrive as a change event rather than having to be told. As the
     * editor does, it writes inserted line breaks with the document's own line ending, and
     * reports the text as inserted.
     */
    public applyEdit(range: Range, newText: string): void {
        const start = this.offsetAt(range.start);
        const end = this.offsetAt(range.end);
        const inserted = newText.replace(/\r\n|\r|\n/g, this.text.includes('\r\n') ? '\r\n' : '\n');
        this.text = this.text.slice(0, start) + inserted + this.text.slice(end);
        fireTextDocumentChange(this, editsInPieces
            ? [{ rangeOffset: start, rangeLength: end - start, text: '' }, { rangeOffset: start, rangeLength: 0, text: inserted }]
            : [{ rangeOffset: start, rangeLength: end - start, text: inserted }]);
    }

    public getText(): string {
        return this.text;
    }

    public setText(text: string): void {
        this.text = text;
    }

    /** Real enough for the writer's offsets: line = newlines before, character = the rest. */
    public positionAt(offset: number): Position {
        return positionIn(this.text, offset);
    }

    /** The inverse, so a test can read back the text an edit would produce. */
    public offsetAt(position: Position): number {
        const lines = this.text.split('\n');
        let offset = 0;
        for (let line = 0; line < position.line && line < lines.length; line++) {
            offset += lines[line].length + 1;
        }
        return offset + position.character;
    }
}

/**
 * The open document itself, since its buffer wins over the disk as the editor's does, or
 * else the file as it is now. A read is recorded as it is attempted, as `fs.readFile` does.
 */
export function openTextDocument(uri: Uri): Promise<{ uri: Uri; getText(): string; positionAt(offset: number): Position }> {
    recordFileRead(uri.path);
    const open = openDocuments.get(uri.toString());
    if (open !== undefined) {
        return Promise.resolve(open);
    }
    const content = virtualFile(uri.path);
    if (content === undefined) {
        return Promise.reject(new Error(`ENOENT: ${uri.path}`));
    }
    return Promise.resolve({ uri, getText: () => content, positionAt: (offset: number) => positionIn(content, offset) });
}

export function textDocuments(): FakeTextDocument[] {
    return [...openDocuments.values()];
}

export class WorkspaceEdit {
    private readonly edits: EditRecord[] = [];

    public replace(uri: Uri, range: Range, newText: string): void {
        this.edits.push({ uri: uri.toString(), range, newText });
    }

    public get entries(): readonly EditRecord[] {
        return this.edits;
    }
}

export async function applyEdit(edit: WorkspaceEdit): Promise<boolean> {
    appliedEdits.push(...edit.entries);
    // As the real one does, rewrite the document and fire the change event only after
    // yielding: another edit can land in that gap, before the session sees its own.
    await Promise.resolve();
    if (applyEditResult instanceof Error) {
        throw applyEditResult;
    }
    if (!applyEditResult) {
        return false;
    }
    for (const entry of edit.entries) {
        openDocuments.get(entry.uri)?.applyEdit(entry.range, entry.newText);
    }
    return true;
}

export function onDidChangeTextDocument(listener: (event: TextDocumentChangeEvent) => void): Disposable {
    documentChangeListeners.push(listener);
    return new Disposable(() => {
        const index = documentChangeListeners.indexOf(listener);
        if (index >= 0) {
            documentChangeListeners.splice(index, 1);
        }
    });
}

// ── arrange ──────────────────────────────────────────────────────────────────
/** Opens a document in the editor with this text, which then wins over the file's. */
export function setOpenDocument(path: string, text: string): FakeTextDocument {
    return new FakeTextDocument(path, text);
}

/** What `workspace.applyEdit` answers from now on: applied, refused, or rejected with this error. */
export function setApplyEditResult(result: boolean | Error): void {
    applyEditResult = result;
}

/** Reports each applied edit as a deletion and an insertion, as the editor may split one replacement. */
export function reportEditsInPieces(inPieces: boolean): void {
    editsInPieces = inPieces;
}

/**
 * Fires `onDidChangeTextDocument`.
 *
 * `changes` is either how many anonymous changes to report — enough for tests that only
 * care that *something* changed, and zero means "no content changed" — or the actual
 * spans, which a session needs because it decides whether an edit was its own by comparing
 * them.
 */
export function fireTextDocumentChange(
    document: { readonly uri: Uri },
    changes: number | readonly ContentChange[] = 1,
): void {
    const contentChanges = typeof changes === 'number'
        ? Array.from({ length: changes }, () => ({ rangeOffset: 0, rangeLength: 0, text: '' }))
        : changes;
    const event: TextDocumentChangeEvent = { document, contentChanges };
    for (const listener of [...documentChangeListeners]) {
        listener(event);
    }
}

// ── assert ───────────────────────────────────────────────────────────────────
export function flushAppliedEdits(): EditRecord[] {
    return appliedEdits.splice(0);
}

/** How many listeners `onDidChangeTextDocument` currently has — a disposal spy. */
export function documentChangeListenerCount(): number {
    return documentChangeListeners.length;
}

export function resetDocuments(): void {
    documentChangeListeners = [];
    openDocuments.clear();
    appliedEdits = [];
    applyEditResult = true;
    editsInPieces = false;
}

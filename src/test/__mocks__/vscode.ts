/**
 * Hand-written stand-in for the `vscode` module, aliased in by the `host` Vitest project.
 * It records what was called, exposes `flush*` helpers to assert on it, `set*` helpers to
 * arrange state, and `resetMocks()` between tests. No auto-mocking library.
 *
 * Only the surface the host actually uses is modelled. Extend it when a test needs more —
 * and only that much.
 */

export interface MessageCall {
    readonly message: string;
    readonly args: readonly unknown[];
}

export interface EditRecord {
    readonly uri: string;
    readonly range: Range;
    readonly newText: string;
}

// ── recorded state ───────────────────────────────────────────────────────────
let errorMessages: string[] = [];
let warningMessages: string[] = [];
let infoMessages: string[] = [];
let messageCalls: MessageCall[] = [];
let appliedEdits: EditRecord[] = [];
let fileReads: string[] = [];
let fileWrites: { path: string; content: string }[] = [];
let configOverrides: Record<string, unknown> = {};
let virtualFiles: Record<string, string> = {};
let messageResult: string | undefined;
let clipboardWrites: string[] = [];
let logLines: string[] = [];
let executedCommands: { command: string; args: readonly unknown[] }[] = [];
let watchers: FakeFileSystemWatcher[] = [];
let workspaceRoot: Uri | undefined;
let searchAvailable = true;
let fileTimes: Record<string, number> = {};
let clock = 0;
let openDocuments: { uri: Uri; getText(): string }[] = [];
let shownDocuments: { path: string; selection?: Range }[] = [];
let revealedPositions: { path: string; line: number }[] = [];
let quickPickCalls: { label: string; description?: string }[][] = [];
let quickPickChoice: number | undefined;
/** One `withProgress` call: where it showed, what it said, and whether its task has ended. */
export interface ProgressRecord {
    readonly location?: number;
    readonly title: string;
    done: boolean;
}
let progressRecords: ProgressRecord[] = [];
let configurationListeners: ((event: ConfigurationChangeEvent) => void)[] = [];
let documentChangeListeners: ((event: TextDocumentChangeEvent) => void)[] = [];
let writableFileSystems: Record<string, boolean> = {};

// ── classes ──────────────────────────────────────────────────────────────────
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

export class Uri {
    public readonly scheme: string;
    public readonly path: string;
    public readonly query: string;
    public readonly fragment: string;

    private constructor(scheme: string, path: string, query = '', fragment = '') {
        this.scheme = scheme;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
    }

    public get fsPath(): string {
        return this.path;
    }

    public static file(path: string): Uri {
        return new Uri('file', path.replace(/\\/g, '/'));
    }

    public static parse(value: string): Uri {
        const match = /^([a-z-]+):\/\/(.*)$/i.exec(value);
        return match ? new Uri(match[1], match[2]) : Uri.file(value);
    }

    public static joinPath(base: Uri, ...segments: string[]): Uri {
        const parts = base.path.split('/');
        for (const segment of segments) {
            for (const piece of segment.split('/')) {
                if (piece === '' || piece === '.') {
                    continue;
                }
                if (piece === '..') {
                    parts.pop();
                    continue;
                }
                parts.push(piece);
            }
        }
        const joined = parts.join('/');
        // As the real one does, a joined URI keeps its base's query and fragment.
        return new Uri(base.scheme, joined === '' ? '/' : joined, base.query, base.fragment);
    }

    public with(change: { readonly scheme?: string; readonly path?: string; readonly query?: string; readonly fragment?: string }): Uri {
        return new Uri(change.scheme ?? this.scheme, change.path ?? this.path, change.query ?? this.query, change.fragment ?? this.fragment);
    }

    public toString(): string {
        return `${this.scheme}://${this.path}`;
    }
}

function withoutTrailingSlash(path: string): string {
    return path.endsWith('/') ? path.slice(0, -1) : path;
}

function isWithin(path: string, folder: string): boolean {
    const base = withoutTrailingSlash(folder);
    return path === base || path.startsWith(`${base}/`);
}

/** A glob relative to a folder, as `findFiles` and watchers take it. */
export class RelativePattern {
    public readonly baseUri: Uri;
    public readonly pattern: string;

    public constructor(base: Uri | string, pattern: string) {
        this.baseUri = typeof base === 'string' ? Uri.file(base) : base;
        this.pattern = pattern;
    }
}

/** A `**` / `*` / `?` glob as a regular expression over a whole path. */
function globRegex(pattern: string): RegExp {
    // One pass with a replacer: expanding `**` in an earlier pass would leave `*`
    // characters that a later single-`*` pass would rewrite again.
    const source = pattern.replace(/\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (token) => {
        switch (token) {
            case '**/':
                return '(?:.*/)?';
            case '**':
                return '.*';
            case '*':
                return '[^/]*';
            case '?':
                return '[^/]';
            default:
                return `\\${token}`;
        }
    });
    return new RegExp(`^${source}$`);
}

/** Whether a virtual path is one the pattern selects. */
function patternMatches(pattern: string | RelativePattern, path: string): boolean {
    if (typeof pattern === 'string') {
        const regex = globRegex(pattern);
        return regex.test(path) || regex.test(path.replace(/^\//, ''));
    }
    const base = pattern.baseUri.path.endsWith('/') ? pattern.baseUri.path : `${pattern.baseUri.path}/`;
    return path.startsWith(base) && globRegex(pattern.pattern).test(path.slice(base.length));
}

/** Line and character of an offset, the way a `TextDocument` counts them. */
function positionIn(text: string, offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, text.length));
    const before = text.slice(0, clamped);
    const line = before.split('\n').length - 1;
    return new Position(line, clamped - (before.lastIndexOf('\n') + 1));
}

export class Disposable {
    private readonly callback: () => void;

    public constructor(callback: () => void) {
        this.callback = callback;
    }

    public dispose(): void {
        this.callback();
    }
}

export class EventEmitter<T> {
    private readonly listeners: ((value: T) => void)[] = [];

    public readonly event = (listener: (value: T) => void): Disposable => {
        this.listeners.push(listener);
        return new Disposable(() => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
                this.listeners.splice(index, 1);
            }
        });
    };

    public fire(value: T): void {
        for (const listener of [...this.listeners]) {
            listener(value);
        }
    }

    public dispose(): void {
        this.listeners.length = 0;
    }
}

export class WorkspaceEdit {
    private readonly edits: EditRecord[] = [];

    public replace(uri: Uri, range: Range, newText: string): void {
        this.edits.push({ uri: uri.toString(), range, newText });
    }

    public insert(uri: Uri, position: Position, newText: string): void {
        this.edits.push({ uri: uri.toString(), range: new Range(position, position), newText });
    }

    public get entries(): readonly EditRecord[] {
        return this.edits;
    }
}

// ── namespaces ───────────────────────────────────────────────────────────────
export class Selection {
    public readonly anchor: Position;
    public readonly active: Position;

    public constructor(anchor: Position, active: Position) {
        this.anchor = anchor;
        this.active = active;
    }
}

export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const;

export const TextEditorRevealType = { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 } as const;

/** What the extension asked for when it registered its editor, options included. */
export const customEditorRegistrations: { viewType: string; options?: unknown }[] = [];

export const window = {
    visibleTextEditors: [] as { document: { uri: Uri; getText(): string } }[],
    activeTextEditor: undefined as { document: { uri: Uri; getText(): string } } | undefined,
    showErrorMessage: (message: string, ...args: unknown[]): Promise<string | undefined> => {
        errorMessages.push(message);
        messageCalls.push({ message, args });
        return Promise.resolve(messageResult);
    },
    showWarningMessage: (message: string, ...args: unknown[]): Promise<string | undefined> => {
        warningMessages.push(message);
        messageCalls.push({ message, args });
        return Promise.resolve(messageResult);
    },
    showInformationMessage: (message: string, ...args: unknown[]): Promise<string | undefined> => {
        infoMessages.push(message);
        messageCalls.push({ message, args });
        return Promise.resolve(messageResult);
    },
    withProgress: <T>(options: { location?: number; title?: string }, task: () => Promise<T>): Promise<T> => {
        const record: ProgressRecord = { location: options.location, title: options.title ?? '', done: false };
        progressRecords.push(record);
        const running = task();
        void running.then(() => {
            record.done = true;
        }, () => {
            record.done = true;
        });
        return running;
    },
    showTextDocument: (document: { uri: Uri; getText(): string }, options?: { selection?: Range }): Promise<FakeTextEditor> => {
        shownDocuments.push({ path: document.uri.path, selection: options?.selection });
        return Promise.resolve(new FakeTextEditor(document));
    },
    showQuickPick: <T extends { label: string; description?: string }>(items: T[], _options?: unknown): Promise<T | undefined> => {
        quickPickCalls.push(items.map(item => ({ label: item.label, description: item.description })));
        return Promise.resolve(quickPickChoice === undefined ? undefined : items[quickPickChoice]);
    },
    registerCustomEditorProvider: (viewType: string, _provider: unknown, options?: unknown): Disposable => {
        customEditorRegistrations.push({ viewType, options });
        return new Disposable(() => { });
    },
    createOutputChannel: (_name: string, _options?: unknown) => ({
        trace: (message: string) => logLines.push(`trace ${message}`),
        debug: (message: string) => logLines.push(`debug ${message}`),
        info: (message: string) => logLines.push(`info ${message}`),
        warn: (message: string) => logLines.push(`warn ${message}`),
        error: (message: string) => logLines.push(`error ${message}`),
        dispose: () => { },
    }),
};

/** Documents `workspace.applyEdit` can actually write to, keyed by URI. */
const editableDocuments = new Map<string, { applyEdit(range: Range, newText: string): void }>();

/** Records where navigation put the cursor, which is what the reveal tests assert on. */
export class FakeTextEditor {
    public readonly document: { uri: Uri; getText(): string };
    public selection: Selection | undefined;

    public constructor(document: { uri: Uri; getText(): string }) {
        this.document = document;
    }

    public revealRange(range: Range, _type?: number): void {
        revealedPositions.push({ path: this.document.uri.path, line: range.start.line });
    }
}

export const workspace = {
    /** An open document's text wins, as the editor's buffer does over the disk. */
    openTextDocument: (uri: Uri): Promise<{ uri: Uri; getText(): string; positionAt(offset: number): Position }> => {
        const open = openDocuments.find(document => document.uri.path === uri.path);
        const content = open === undefined ? virtualFiles[uri.path] : open.getText();
        if (content === undefined) {
            return Promise.reject(new Error(`ENOENT: ${uri.path}`));
        }
        fileReads.push(uri.path);
        return Promise.resolve({ uri, getText: () => content, positionAt: (offset: number) => positionIn(content, offset) });
    },
    get textDocuments(): { uri: Uri; getText(): string }[] {
        return openDocuments;
    },
    getConfiguration: (section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            const full = section === undefined ? key : `${section}.${key}`;
            if (full in configOverrides) {
                return configOverrides[full] as T;
            }
            if (key in configOverrides) {
                return configOverrides[key] as T;
            }
            return defaultValue;
        },
    }),
    fs: {
        readFile: (uri: Uri): Promise<Uint8Array> => {
            fileReads.push(uri.path);
            const content = virtualFiles[uri.path];
            if (content === undefined) {
                return Promise.reject(new Error(`ENOENT: ${uri.path}`));
            }
            return Promise.resolve(new TextEncoder().encode(content));
        },
        writeFile: (uri: Uri, content: Uint8Array): Promise<void> => {
            const text = new TextDecoder().decode(content);
            virtualFiles[uri.path] = text;
            fileWrites.push({ path: uri.path, content: text });
            return Promise.resolve();
        },
        isWritableFileSystem: (scheme: string): boolean | undefined => writableFileSystems[scheme],
        /** A folder's files and, one level down, the folders that hold more. */
        readDirectory: (uri: Uri): Promise<[string, number][]> => {
            const prefix = uri.path.endsWith('/') ? uri.path : `${uri.path}/`;
            const entries = new Map<string, number>();
            for (const path of Object.keys(virtualFiles)) {
                if (!path.startsWith(prefix)) {
                    continue;
                }
                const rest = path.slice(prefix.length);
                const slash = rest.indexOf('/');
                entries.set(slash < 0 ? rest : rest.slice(0, slash), slash < 0 ? FileType.File : FileType.Directory);
            }
            if (entries.size === 0) {
                return Promise.reject(new Error(`ENOENT: ${uri.path}`));
            }
            return Promise.resolve([...entries]);
        },
        stat: (uri: Uri): Promise<{ type: number; size: number; mtime: number }> => {
            const content = virtualFiles[uri.path];
            if (content !== undefined) {
                return Promise.resolve({ type: FileType.File, size: content.length, mtime: fileTimes[uri.path] ?? 0 });
            }
            const prefix = uri.path.endsWith('/') ? uri.path : `${uri.path}/`;
            if (Object.keys(virtualFiles).some(path => path.startsWith(prefix))) {
                return Promise.resolve({ type: FileType.Directory, size: 0, mtime: 0 });
            }
            return Promise.reject(new Error(`ENOENT: ${uri.path}`));
        },
    },
    createFileSystemWatcher: (pattern: string | RelativePattern): FakeFileSystemWatcher => new FakeFileSystemWatcher(pattern),
    /** The folder only for a URI inside it, as the real one answers. */
    getWorkspaceFolder: (uri: Uri): { uri: Uri } | undefined =>
        (workspaceRoot?.scheme === uri.scheme && isWithin(uri.path, workspaceRoot.path) ? { uri: workspaceRoot } : undefined),
    asRelativePath: (pathOrUri: Uri | string): string => {
        const path = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.path;
        return workspaceRoot !== undefined && isWithin(path, workspaceRoot.path) && path !== workspaceRoot.path
            ? path.slice(withoutTrailingSlash(workspaceRoot.path).length + 1)
            : path;
    },
    get workspaceFolders(): { uri: Uri }[] | undefined {
        return workspaceRoot === undefined ? undefined : [{ uri: workspaceRoot }];
    },
    /**
     * Matches virtual file paths against a `**` / `*` glob, plain or relative to a folder.
     * Finds nothing at all when search is switched off, as a host without a search
     * provider does.
     */
    findFiles: (pattern: string | RelativePattern, _exclude?: unknown, maxResults?: number): Promise<Uri[]> => {
        if (!searchAvailable) {
            return Promise.resolve([]);
        }
        const found = Object.keys(virtualFiles).filter(path => patternMatches(pattern, path)).map(path => Uri.file(path));
        return Promise.resolve(maxResults === undefined ? found : found.slice(0, maxResults));
    },
    applyEdit: async (edit: WorkspaceEdit): Promise<boolean> => {
        appliedEdits.push(...edit.entries);
        // As the real one does, rewrite the document and fire the change event only after
        // yielding: another edit can land in that gap, before the session sees its own.
        await Promise.resolve();
        for (const entry of edit.entries) {
            const document = editableDocuments.get(entry.uri);
            document?.applyEdit(entry.range, entry.newText);
        }
        return true;
    },
    onDidChangeTextDocument: (listener: (event: TextDocumentChangeEvent) => void): Disposable => {
        documentChangeListeners.push(listener);
        return new Disposable(() => {
            const index = documentChangeListeners.indexOf(listener);
            if (index >= 0) {
                documentChangeListeners.splice(index, 1);
            }
        });
    },
    onDidChangeConfiguration: (listener: (event: ConfigurationChangeEvent) => void): Disposable => {
        configurationListeners.push(listener);
        return new Disposable(() => {
            const index = configurationListeners.indexOf(listener);
            if (index >= 0) {
                configurationListeners.splice(index, 1);
            }
        });
    },
};

export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string, scope?: unknown): boolean;
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

/** Enough of a `TextDocument` for a session: an identity and its text. */
export class FakeTextDocument {
    public readonly uri: Uri;
    /** What the editor detected on read. The session warns that a save drops a `utf8bom` BOM. */
    public encoding: string;
    private text: string;

    public constructor(path: string, text: string, encoding = 'utf8') {
        this.uri = Uri.file(path);
        this.text = text;
        this.encoding = encoding;
        editableDocuments.set(this.uri.toString(), this);
    }

    /**
     * Replaces a range and reports it, the way the editor does — so a session under test
     * sees its own edit arrive as a change event rather than having to be told.
     */
    public applyEdit(range: Range, newText: string): void {
        const start = this.offsetAt(range.start);
        const end = this.offsetAt(range.end);
        this.text = this.text.slice(0, start) + newText + this.text.slice(end);
        fireTextDocumentChange(this, [{ rangeOffset: start, rangeLength: end - start, text: newText }]);
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

export const env = {
    clipboard: {
        writeText: (text: string): Promise<void> => {
            clipboardWrites.push(text);
            return Promise.resolve();
        },
    },
};

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const;

type WatchedKind = 'created' | 'deleted' | 'changed';

/** Three events and a dispose; only paths its pattern selects reach its listeners. */
class FakeFileSystemWatcher {
    public readonly pattern: string | RelativePattern;
    public readonly listeners: Record<WatchedKind, ((uri: Uri) => void)[]> = { created: [], deleted: [], changed: [] };

    public constructor(pattern: string | RelativePattern) {
        this.pattern = pattern;
        watchers.push(this);
    }

    public readonly onDidCreate = (listener: (uri: Uri) => void): Disposable => this.listen('created', listener);

    public readonly onDidDelete = (listener: (uri: Uri) => void): Disposable => this.listen('deleted', listener);

    public readonly onDidChange = (listener: (uri: Uri) => void): Disposable => this.listen('changed', listener);

    public dispose(): void {
        watchers = watchers.filter(watcher => watcher !== this);
    }

    private listen(kind: WatchedKind, listener: (uri: Uri) => void): Disposable {
        this.listeners[kind].push(listener);
        return new Disposable(() => {
            this.listeners[kind] = this.listeners[kind].filter(each => each !== listener);
        });
    }
}

export const commands = {
    registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown): Disposable =>
        new Disposable(() => { }),
    executeCommand: (command: string, ...args: unknown[]): Promise<void> => {
        executedCommands.push({ command, args });
        return Promise.resolve();
    },
};

// ── arrange ──────────────────────────────────────────────────────────────────
/** Registers a virtual file (path → text) readable via `workspace.fs` and `findFiles`; each write moves its mtime on. */
export function setVirtualFile(path: string, content: string): void {
    const normalised = path.replace(/\\/g, '/');
    virtualFiles[normalised] = content;
    fileTimes[normalised] = ++clock;
}

/** Whether `findFiles` finds anything — off, as in a host with no search provider. */
export function setSearchAvailable(available: boolean): void {
    searchAvailable = available;
}

/** Opens a document in the editor with this text, which then wins over the file's. */
export function setOpenDocument(path: string, text: string): void {
    const uri = Uri.file(path);
    openDocuments = [...openDocuments.filter(document => document.uri.path !== uri.path), { uri, getText: () => text }];
}

/** Overrides a configuration value, by bare key or fully qualified `section.key`. */
export function setConfigOverride(key: string, value: unknown): void {
    configOverrides[key] = value;
}

/** Fires `onDidChangeConfiguration`; `affectsConfiguration` is true for any prefix of one of `sections`. */
export function fireConfigurationChange(...sections: string[]): void {
    const event: ConfigurationChangeEvent = {
        affectsConfiguration: (section: string) => sections.some(changed => changed === section || changed.startsWith(`${section}.`)),
    };
    for (const listener of [...configurationListeners]) {
        listener(event);
    }
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

const BACKSLASH = String.fromCharCode(92);
const FORWARD = '/';

/** Removes one virtual file, as deleting it on disk would. */
export function removeVirtualFile(path: string): void {
    delete virtualFiles[path.split(BACKSLASH).join(FORWARD)];
}

/** Which QuickPick entry the next `showQuickPick` returns; undefined means cancelled. */
export function setQuickPickResult(index: number | undefined): void {
    quickPickChoice = index;
}

/** Sets the single workspace folder `getWorkspaceFolder` reports. */
export function setWorkspaceRoot(path: string | undefined): void {
    workspaceRoot = path === undefined ? undefined : Uri.file(path);
}

/** Fires every file-system watcher whose pattern selects the path, as a file appearing, changing or vanishing would. */
export function fireFileWatcher(kind: WatchedKind, path: string): void {
    for (const watcher of [...watchers]) {
        if (patternMatches(watcher.pattern, path)) {
            for (const listener of [...watcher.listeners[kind]]) {
                listener(Uri.file(path));
            }
        }
    }
}

/** How many watchers are live — a disposal spy. */
export function watcherCount(): number {
    return watchers.length;
}

/** Declares a scheme's file system read-only, as VS Code does for e.g. `git:`. */
export function setWritableFileSystem(scheme: string, writable: boolean): void {
    writableFileSystems[scheme] = writable;
}

/** How many listeners `onDidChangeTextDocument` currently has — a disposal spy. */
export function documentChangeListenerCount(): number {
    return documentChangeListeners.length;
}

/** The same spy for `onDidChangeConfiguration`. */
export function configurationListenerCount(): number {
    return configurationListeners.length;
}

/** Sets what the next `show*Message` call resolves to. */
export function setMessageResult(result: string | undefined): void {
    messageResult = result;
}

// ── assert ───────────────────────────────────────────────────────────────────
export function flushErrorMessages(): string[] {
    return errorMessages.splice(0);
}

export function flushWarningMessages(): string[] {
    return warningMessages.splice(0);
}

export function flushInfoMessages(): string[] {
    return infoMessages.splice(0);
}

export function flushMessageCalls(): MessageCall[] {
    return messageCalls.splice(0);
}

export function flushAppliedEdits(): EditRecord[] {
    return appliedEdits.splice(0);
}

export function flushFileReads(): string[] {
    return fileReads.splice(0);
}

export function flushFileWrites(): { path: string; content: string }[] {
    return fileWrites.splice(0);
}

export function flushClipboardWrites(): string[] {
    return clipboardWrites.splice(0);
}

export function flushRevealedPositions(): { path: string; line: number }[] {
    const taken = revealedPositions;
    revealedPositions = [];
    return taken;
}

export function flushProgressTitles(): string[] {
    return flushProgress().map(record => record.title);
}

/** The progress shown so far; a record keeps updating after it is taken, so `done` can be watched. */
export function flushProgress(): ProgressRecord[] {
    return progressRecords.splice(0);
}

export function flushQuickPicks(): { label: string; description?: string }[][] {
    const taken = quickPickCalls;
    quickPickCalls = [];
    return taken;
}

export function flushExecutedCommands(): { command: string; args: readonly unknown[] }[] {
    return executedCommands.splice(0);
}

/** Which documents were shown, and with which selection. */
export function flushShownDocuments(): { path: string; selection?: Range }[] {
    return shownDocuments.splice(0);
}

/** Everything written to the `LogOutputChannel`, each line prefixed with its level. */
export function flushLogs(): string[] {
    return logLines.splice(0);
}

// ── reset ────────────────────────────────────────────────────────────────────
export function resetMocks(): void {
    errorMessages = [];
    warningMessages = [];
    infoMessages = [];
    messageCalls = [];
    appliedEdits = [];
    fileReads = [];
    fileWrites = [];
    configOverrides = {};
    virtualFiles = {};
    messageResult = undefined;
    clipboardWrites = [];
    configurationListeners = [];
    documentChangeListeners = [];
    writableFileSystems = {};
    logLines = [];
    executedCommands = [];
    watchers = [];
    workspaceRoot = undefined;
    searchAvailable = true;
    fileTimes = {};
    openDocuments = [];
    shownDocuments = [];
    editableDocuments.clear();
    revealedPositions = [];
    quickPickCalls = [];
    quickPickChoice = undefined;
    progressRecords = [];
}

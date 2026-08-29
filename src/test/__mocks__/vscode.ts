/**
 * Hand-written stand-in for the `vscode` module, aliased in by the `host` Vitest project.
 * Style follows gob-numberingtool-vscode (DEC-023): record what was called, expose
 * `flush*` helpers to assert on it, `set*` helpers to arrange state, and `resetMocks()`
 * between tests. No auto-mocking library.
 *
 * Only the surface the host actually uses is modelled. Extend it when a task needs more —
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
let watcherListeners: { created: ((uri: Uri) => void)[]; deleted: ((uri: Uri) => void)[]; changed: ((uri: Uri) => void)[] } = { created: [], deleted: [], changed: [] };
let workspaceRoot: Uri | undefined;
let revealedPositions: { path: string; line: number }[] = [];
let quickPickCalls: { label: string; description?: string }[][] = [];
let quickPickChoice: number | undefined;
let progressTitles: string[] = [];
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

    private constructor(scheme: string, path: string) {
        this.scheme = scheme;
        this.path = path;
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
        return new Uri(base.scheme, joined === '' ? '/' : joined);
    }

    public toString(): string {
        return `${this.scheme}://${this.path}`;
    }
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
    withProgress: <T>(options: { title?: string }, task: () => Promise<T>): Promise<T> => {
        progressTitles.push(options.title ?? '');
        return task();
    },
    showTextDocument: (document: { uri: Uri; getText(): string }, _options?: unknown): Promise<FakeTextEditor> =>
        Promise.resolve(new FakeTextEditor(document)),
    showQuickPick: <T extends { label: string; description?: string }>(items: T[], _options?: unknown): Promise<T | undefined> => {
        quickPickCalls.push(items.map(item => ({ label: item.label, description: item.description })));
        return Promise.resolve(quickPickChoice === undefined ? undefined : items[quickPickChoice]);
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
    openTextDocument: (uri: Uri): Promise<{ uri: Uri; getText(): string }> => {
        const content = virtualFiles[uri.path];
        if (content === undefined) {
            return Promise.reject(new Error(`ENOENT: ${uri.path}`));
        }
        fileReads.push(uri.path);
        return Promise.resolve({ uri, getText: () => content });
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
        readDirectory: (uri: Uri): Promise<[string, number][]> => {
            const prefix = uri.path.endsWith('/') ? uri.path : `${uri.path}/`;
            const names = new Set<string>();
            for (const path of Object.keys(virtualFiles)) {
                if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
                    names.add(path.slice(prefix.length));
                }
            }
            if (names.size === 0 && !Object.keys(virtualFiles).some(path => path.startsWith(prefix))) {
                return Promise.reject(new Error(`ENOENT: ${uri.path}`));
            }
            return Promise.resolve([...names].map(name => [name, FileType.File] as [string, number]));
        },
        stat: (uri: Uri): Promise<{ type: number; size: number }> => {
            const content = virtualFiles[uri.path];
            if (content === undefined) {
                return Promise.reject(new Error(`ENOENT: ${uri.path}`));
            }
            return Promise.resolve({ type: 1, size: content.length });
        },
    },
    /** Matches virtual file paths against a `**` / `*` glob. Enough for the resolver tests. */
    createFileSystemWatcher: (_pattern: string): FakeFileSystemWatcher => new FakeFileSystemWatcher(),
    getWorkspaceFolder: (_uri: Uri): { uri: Uri } | undefined =>
        (workspaceRoot === undefined ? undefined : { uri: workspaceRoot }),
    get workspaceFolders(): { uri: Uri }[] | undefined {
        return workspaceRoot === undefined ? undefined : [{ uri: workspaceRoot }];
    },
    findFiles: (pattern: string): Promise<Uri[]> => {
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
        const regex = new RegExp(`^${source}$`);
        const matches = Object.keys(virtualFiles)
            .filter(path => regex.test(path) || regex.test(path.replace(/^\//, '')))
            .map(path => Uri.file(path));
        return Promise.resolve(matches);
    },
    applyEdit: (edit: WorkspaceEdit): Promise<boolean> => {
        appliedEdits.push(...edit.entries);
        return Promise.resolve(true);
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

export interface TextDocumentChangeEvent {
    readonly document: { readonly uri: Uri };
    readonly contentChanges: readonly unknown[];
}

/** Enough of a `TextDocument` for a session: an identity and its text. */
export class FakeTextDocument {
    public readonly uri: Uri;
    private text: string;

    public constructor(path: string, text: string) {
        this.uri = Uri.file(path);
        this.text = text;
    }

    public getText(): string {
        return this.text;
    }

    public setText(text: string): void {
        this.text = text;
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

/** Only what the resolver uses: three events and a dispose. */
class FakeFileSystemWatcher {
    public readonly onDidCreate = (listener: (uri: Uri) => void): Disposable => {
        watcherListeners.created.push(listener);
        return new Disposable(() => { });
    };

    public readonly onDidDelete = (listener: (uri: Uri) => void): Disposable => {
        watcherListeners.deleted.push(listener);
        return new Disposable(() => { });
    };

    public readonly onDidChange = (listener: (uri: Uri) => void): Disposable => {
        watcherListeners.changed.push(listener);
        return new Disposable(() => { });
    };

    public dispose(): void { }
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
/** Registers a virtual file (path → text) readable via `workspace.fs` and `findFiles`. */
export function setVirtualFile(path: string, content: string): void {
    virtualFiles[path.replace(/\\/g, '/')] = content;
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

/** Fires `onDidChangeTextDocument`. `changes` defaults to one entry — zero means "no content changed". */
export function fireTextDocumentChange(document: { readonly uri: Uri }, changes = 1): void {
    const event: TextDocumentChangeEvent = { document, contentChanges: Array.from({ length: changes }, () => ({})) };
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

/** Sets the single workspace folder `getWorkspaceFolder` reports. */
/** Which QuickPick entry the next `showQuickPick` returns; undefined means cancelled. */
export function setQuickPickResult(index: number | undefined): void {
    quickPickChoice = index;
}

export function setWorkspaceRoot(path: string | undefined): void {
    workspaceRoot = path === undefined ? undefined : Uri.file(path);
}

/** Fires the file-system watcher, as a `.g.xlf` appearing or vanishing would. */
export function fireFileWatcher(kind: 'created' | 'deleted' | 'changed', path: string): void {
    for (const listener of [...watcherListeners[kind]]) {
        listener(Uri.file(path));
    }
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
    const taken = progressTitles;
    progressTitles = [];
    return taken;
}

export function flushQuickPicks(): { label: string; description?: string }[][] {
    const taken = quickPickCalls;
    quickPickCalls = [];
    return taken;
}

export function flushExecutedCommands(): { command: string; args: readonly unknown[] }[] {
    return executedCommands.splice(0);
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
    watcherListeners = { created: [], deleted: [], changed: [] };
    workspaceRoot = undefined;
    revealedPositions = [];
    quickPickCalls = [];
    quickPickChoice = undefined;
    progressTitles = [];
}

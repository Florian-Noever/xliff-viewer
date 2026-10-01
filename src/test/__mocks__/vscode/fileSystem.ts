/** A virtual file system: files by path, the reads and writes made on it, and watchers. */

import { Disposable } from './events';
import { normalisePath, patternMatches, Uri } from './uri';

import type { RelativePattern } from './uri';

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const;

let virtualFiles: Record<string, string> = {};
let fileTimes: Record<string, number> = {};
let clock = 0;
const heldReads = new Map<string, Promise<void>>();
let fileReads: string[] = [];
let fileWrites: { path: string; content: string }[] = [];
let writableFileSystems: Record<string, boolean> = {};
let searchAvailable = true;
let watchers: FakeFileSystemWatcher[] = [];

/** A virtual file's text, or undefined when there is none. */
export function virtualFile(path: string): string | undefined {
    return virtualFiles[path];
}

/** Notes that a file was read, for `flushFileReads`. */
export function recordFileRead(path: string): void {
    fileReads.push(path);
}

/** A folder's entries, the way `readDirectory` lists them: its files, and the folders one level down that hold more. */
function entriesOf(folder: string): Map<string, number> {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    const entries = new Map<string, number>();
    for (const path of Object.keys(virtualFiles)) {
        if (!path.startsWith(prefix)) {
            continue;
        }
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf('/');
        entries.set(slash < 0 ? rest : rest.slice(0, slash), slash < 0 ? FileType.File : FileType.Directory);
    }
    return entries;
}

export const fs = {
    readFile: async (uri: Uri): Promise<Uint8Array> => {
        recordFileRead(uri.path);
        const content = virtualFiles[uri.path];
        const held = heldReads.get(uri.path);
        if (held !== undefined) {
            heldReads.delete(uri.path);
            await held;
        }
        if (content === undefined) {
            throw new Error(`ENOENT: ${uri.path}`);
        }
        return new TextEncoder().encode(content);
    },
    writeFile: (uri: Uri, content: Uint8Array): Promise<void> => {
        const text = new TextDecoder().decode(content);
        virtualFiles[uri.path] = text;
        fileWrites.push({ path: uri.path, content: text });
        return Promise.resolve();
    },
    isWritableFileSystem: (scheme: string): boolean | undefined => writableFileSystems[scheme],
    readDirectory: (uri: Uri): Promise<[string, number][]> => {
        const entries = entriesOf(uri.path);
        return entries.size === 0 ? Promise.reject(new Error(`ENOENT: ${uri.path}`)) : Promise.resolve([...entries]);
    },
    stat: (uri: Uri): Promise<{ type: number; size: number; mtime: number }> => {
        const content = virtualFiles[uri.path];
        if (content !== undefined) {
            return Promise.resolve({ type: FileType.File, size: content.length, mtime: fileTimes[uri.path] ?? 0 });
        }
        if (entriesOf(uri.path).size > 0) {
            return Promise.resolve({ type: FileType.Directory, size: 0, mtime: 0 });
        }
        return Promise.reject(new Error(`ENOENT: ${uri.path}`));
    },
};

/** Virtual paths the glob selects; nothing at all when search is off, as in a host without a search provider. */
export function findFiles(pattern: string | RelativePattern, _exclude?: unknown, maxResults?: number): Promise<Uri[]> {
    if (!searchAvailable) {
        return Promise.resolve([]);
    }
    const found = Object.keys(virtualFiles).filter(path => patternMatches(pattern, path)).map(path => Uri.file(path));
    return Promise.resolve(maxResults === undefined ? found : found.slice(0, maxResults));
}

export type WatchedKind = 'created' | 'deleted' | 'changed';

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

export function createFileSystemWatcher(pattern: string | RelativePattern): FakeFileSystemWatcher {
    return new FakeFileSystemWatcher(pattern);
}

// ── arrange ──────────────────────────────────────────────────────────────────
/** Registers a virtual file (path → text) readable via `workspace.fs` and `findFiles`; each write moves its mtime on. */
export function setVirtualFile(path: string, content: string): void {
    const normalised = normalisePath(path);
    virtualFiles[normalised] = content;
    fileTimes[normalised] = ++clock;
}

/** Removes one virtual file, as deleting it on disk would. */
export function removeVirtualFile(path: string): void {
    delete virtualFiles[normalisePath(path)];
}

/**
 * Holds the next `workspace.fs.readFile` of `path` until the returned function is called. The
 * read answers with the file as it was when it was asked for, as a read already under way does.
 */
export function holdFileRead(path: string): () => void {
    let release = (): void => { };
    heldReads.set(path, new Promise<void>((resolve) => {
        release = resolve;
    }));
    return () => {
        release();
    };
}

/** Declares a scheme's file system read-only, as VS Code does for e.g. `git:`. */
export function setWritableFileSystem(scheme: string, writable: boolean): void {
    writableFileSystems[scheme] = writable;
}

/** Whether `findFiles` finds anything — off, as in a host with no search provider. */
export function setSearchAvailable(available: boolean): void {
    searchAvailable = available;
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

// ── assert ───────────────────────────────────────────────────────────────────
export function flushFileReads(): string[] {
    return fileReads.splice(0);
}

export function flushFileWrites(): { path: string; content: string }[] {
    return fileWrites.splice(0);
}

/** How many watchers are live — a disposal spy. */
export function watcherCount(): number {
    return watchers.length;
}

export function resetFileSystem(): void {
    virtualFiles = {};
    fileTimes = {};
    heldReads.clear();
    fileReads = [];
    fileWrites = [];
    writableFileSystems = {};
    searchAvailable = true;
    watchers = [];
}

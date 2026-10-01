import * as vscode from 'vscode';

import { listAlFiles } from './alFileListing';
import { alScopeFor } from './alScope';
import { Logger } from './logger';
import { indexedObjects } from '../al/alHeaderIndex';
import { outlineAl, scanHeaders } from '../al/alOutline';
import { candidateObjects, locateUnit } from '../al/unitLocator';

import type { AlScope } from './alScope';
import type { IndexedObject } from '../al/alHeaderIndex';
import type { AlOutline } from '../al/alOutline';
import type { UnitTarget } from '../al/alTarget';
import type { LocateResult } from '../al/unitLocator';

/**
 * Which objects an app's AL files declare, kept up to date without re-reading the app.
 *
 * Built on first use — most documents never ask for it — from object headers alone. A
 * watcher drops a changed file's entry and forgets the listing when files come or go; where
 * watchers do not fire, a miss triggers one refresh that re-reads whatever changed. The
 * index only chooses candidates: the candidates themselves are always read at the moment of
 * asking, from the open document when there is one, so what is found is what is there.
 */

export interface AlLocateOutcome {
    readonly result: LocateResult;
    /** The documents the candidates were read from, by the file key a location names. */
    readonly documents: ReadonlyMap<string, vscode.TextDocument>;
}

interface FileEntry {
    readonly mtime: number;
    readonly objects: readonly IndexedObject[];
}

/** Files read, or checked, at once. */
const BATCH = 8;
/** A second miss this soon after a refresh does not refresh again. */
const REFRESH_INTERVAL_MS = 2000;
/**
 * In an app with no AL file at all, a miss is what every click is, and listing again means
 * searching and then walking the whole folder; so it is done this seldom.
 */
const EMPTY_REFRESH_INTERVAL_MS = 30000;
/** How often a build reads again what a watcher dropped while it was reading. */
const BUILD_PASSES = 3;
/** The modification time of an entry whose file could not even be stat'ed. */
const UNKNOWN_MTIME = -1;

export class AlSourceIndex implements vscode.Disposable {
    private current: AlScope;
    private readonly changed = new vscode.EventEmitter<void>();
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly entries = new Map<string, FileEntry>();
    private listing: Promise<readonly vscode.Uri[]> | undefined;
    private building: Promise<readonly IndexedObject[]> | undefined;
    private lastRefresh = 0;
    /** When the current listing was taken. */
    private listedAt = 0;

    public constructor(scope: AlScope) {
        this.current = scope;
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(scope.folder, '**/*.al'));
        this.subscriptions.push(
            watcher,
            this.changed,
            watcher.onDidChange(uri => this.entries.delete(uri.toString())),
            watcher.onDidCreate(() => this.forgetListing()),
            watcher.onDidDelete((uri) => {
                this.entries.delete(uri.toString());
                this.forgetListing();
            }),
        );
    }

    public get scope(): AlScope {
        return this.current;
    }

    /**
     * Takes the app's preprocessor symbols as `app.json` says them now.
     *
     * `#if` decides which objects a file declares, so new symbols drop every entry and the
     * next build reads the files again.
     */
    public useSymbols(symbols: readonly string[]): void {
        if (symbols.length === this.current.symbols.length && symbols.every((symbol, at) => symbol === this.current.symbols[at])) {
            return;
        }
        this.current = { ...this.current, symbols };
        this.entries.clear();
    }

    /** Fires when files come or go, so whether AL source exists can be asked again. */
    public get onDidChangeFiles(): vscode.Event<void> {
        return this.changed.event;
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions.length = 0;
        this.entries.clear();
    }

    public async hasAlFiles(): Promise<boolean> {
        return (await this.files()).length > 0;
    }

    /** Every object the app declares, building what is missing — one build at a time. */
    public async objects(): Promise<readonly IndexedObject[]> {
        this.building ??= this.build();
        try {
            return await this.building;
        } finally {
            this.building = undefined;
        }
    }

    /** Finds where a unit is declared, refreshing once when it is not found at all. */
    public async locate(target: UnitTarget): Promise<AlLocateOutcome> {
        const first = await this.locateOnce(target);
        if (first.result.kind !== 'notFound') {
            return first;
        }
        const recent = (await this.files()).length === 0
            ? Date.now() - this.listedAt < EMPTY_REFRESH_INTERVAL_MS
            : Date.now() - this.lastRefresh < REFRESH_INTERVAL_MS;
        if (recent) {
            return first;
        }
        await this.refresh();
        return this.locateOnce(target);
    }

    private forgetListing(): void {
        this.listing = undefined;
        this.changed.fire();
    }

    private async files(): Promise<readonly vscode.Uri[]> {
        if (this.listing === undefined) {
            this.listedAt = Date.now();
            this.listing = listAlFiles(this.scope.folder).then(listing => listing.files);
        }
        return this.listing;
    }

    private async build(): Promise<readonly IndexedObject[]> {
        const files = await this.files();
        const unread = (): vscode.Uri[] => files.filter(uri => !this.entries.has(uri.toString()));
        if (unread().length > 0) {
            // A large app takes visible time to read, and this runs on a click. A watcher can
            // drop an entry while the others are being read, so what it dropped is read again.
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Indexing AL objects…' }, async () => {
                for (let pass = 0; pass < BUILD_PASSES && unread().length > 0; pass++) {
                    await this.readAll(unread());
                }
            });
        }
        return files.flatMap(uri => this.entries.get(uri.toString())?.objects ?? []);
    }

    private async readAll(uris: readonly vscode.Uri[]): Promise<void> {
        for (let start = 0; start < uris.length; start += BATCH) {
            await Promise.all(uris.slice(start, start + BATCH).map(uri => this.readEntry(uri)));
        }
    }

    private async readEntry(uri: vscode.Uri): Promise<void> {
        const key = uri.toString();
        const [text, stat] = await Promise.allSettled([readText(uri), vscode.workspace.fs.stat(uri)]);
        const mtime = stat.status === 'fulfilled' ? stat.value.mtime : UNKNOWN_MTIME;
        if (text.status === 'fulfilled') {
            this.entries.set(key, { mtime, objects: indexedObjects(key, scanHeaders(text.value, this.current.symbols)) });
            return;
        }
        // Remembered as declaring nothing, so a file that cannot be read is not read again on
        // every click. A refresh retries it once its modification time moves.
        this.entries.set(key, { mtime, objects: [] });
        Logger.warn(`Could not read ${uri.path}: ${text.reason instanceof Error ? text.reason.message : 'unknown error'}`);
    }

    /** Lists the files again, and forgets every entry whose file changed or went. */
    private async refresh(): Promise<void> {
        this.lastRefresh = Date.now();
        const before = new Set((await this.files()).map(uri => uri.toString()));
        this.listing = undefined;
        const listed = new Set((await this.files()).map(uri => uri.toString()));
        // Where no watcher fires, this is the only way to learn that files came or went.
        if (listed.size !== before.size || [...listed].some(key => !before.has(key))) {
            this.changed.fire();
        }

        const entries = [...this.entries];
        for (let start = 0; start < entries.length; start += BATCH) {
            await Promise.all(entries.slice(start, start + BATCH).map(async ([key, entry]) => {
                if (!listed.has(key)) {
                    this.entries.delete(key);
                    return;
                }
                try {
                    if ((await vscode.workspace.fs.stat(vscode.Uri.parse(key))).mtime !== entry.mtime) {
                        this.entries.delete(key);
                    }
                } catch {
                    this.entries.delete(key);
                }
            }));
        }
    }

    private async locateOnce(target: UnitTarget): Promise<AlLocateOutcome> {
        const candidates = candidateObjects(target, await this.objects());
        const documents = new Map<string, vscode.TextDocument>();
        const outlines = new Map<string, AlOutline>();

        for (const file of new Set(candidates.map(candidate => candidate.object.file))) {
            try {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(file));
                documents.set(file, document);
                outlines.set(file, outlineAl(document.getText(), this.scope.symbols));
            } catch {
                this.entries.delete(file);
            }
        }

        return { result: locateUnit(target, candidates, outlines), documents };
    }
}

/** An open document's text wins over the one on disk: it is what the user sees. */
async function readText(uri: vscode.Uri): Promise<string> {
    const open = vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
    return open === undefined ? new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)) : open.getText();
}

/** A hold on an app's index, which lives while anyone holds it. Released once. */
export interface AlIndexLease {
    readonly index: AlSourceIndex;
    release(): void;
}

interface HeldIndex {
    readonly index: AlSourceIndex;
    holders: number;
}

/**
 * One index per app, shared by every translation file of it, and kept only while held: the
 * last release disposes the index and its watcher.
 */
export class AlSourceIndexes implements vscode.Disposable {
    private readonly held = new Map<string, HeldIndex>();
    private disposed = false;

    /** A lease on the index of the app a file belongs to; undefined when it belongs to none. */
    public async acquire(file: vscode.Uri): Promise<AlIndexLease | undefined> {
        const scope = await alScopeFor(file);
        if (scope === undefined || this.disposed) {
            return undefined;
        }
        const key = scope.folder.toString();
        const entry = this.held.get(key) ?? this.hold(key, scope);
        entry.holders++;
        // Asked on every acquire, so a changed `app.json` counts from the next click on.
        entry.index.useSymbols(scope.symbols);
        return this.leaseOf(key, entry);
    }

    public dispose(): void {
        this.disposed = true;
        for (const { index } of this.held.values()) {
            index.dispose();
        }
        this.held.clear();
    }

    private hold(key: string, scope: AlScope): HeldIndex {
        const entry = { index: new AlSourceIndex(scope), holders: 0 };
        this.held.set(key, entry);
        return entry;
    }

    private leaseOf(key: string, entry: HeldIndex): AlIndexLease {
        let released = false;
        return {
            index: entry.index,
            release: () => {
                if (released) {
                    return;
                }
                released = true;
                entry.holders--;
                if (entry.holders === 0 && this.held.get(key) === entry) {
                    entry.index.dispose();
                    this.held.delete(key);
                }
            },
        };
    }
}

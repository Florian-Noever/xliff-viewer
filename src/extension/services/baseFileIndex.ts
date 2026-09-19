import * as vscode from 'vscode';

import { Logger } from './logger';

import { parseXliff } from '../xliff/parser';
import { iterateUnits } from '../../shared/model';

/**
 * What a base file says each unit's source is.
 *
 * Parsed on first need rather than on open, and **the model is dropped immediately**: all
 * that survives is an id → source map. A base file is the same size as the language file
 * it pairs with, and holding both models would double peak memory for the sake of one
 * string per unit.
 *
 * Cached per base-file URI and shared across every language file that resolves to it —
 * an app with ten languages parses its base once.
 */
export class BaseFileIndex implements vscode.Disposable {
    private readonly cache = new Map<string, ReadonlyMap<string, string>>();
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly changed = new vscode.EventEmitter<vscode.Uri>();

    /**
     * A base file appeared, changed or went away.
     *
     * Regenerating `App.g.xlf` while a translator has `App.de-DE.xlf` open is the normal
     * workflow, not an edge case — dropping the cache is not enough, because the markers
     * already on screen were computed from the old one.
     */
    public readonly onDidChange: vscode.Event<vscode.Uri> = this.changed.event;

    public constructor() {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.g.xlf');
        this.subscriptions.push(
            watcher,
            watcher.onDidChange(uri => this.forget(uri)),
            watcher.onDidDelete(uri => this.forget(uri)),
            watcher.onDidCreate(uri => this.forget(uri)),
        );
    }

    /**
     * Empty when the file cannot be read or parsed — which is a reason to show no markers,
     * not a reason to fail: the base file is somebody else's artefact and may be mid-write.
     */
    public async sourcesOf(baseUri: vscode.Uri): Promise<ReadonlyMap<string, string>> {
        const key = baseUri.toString();
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const sources = await this.read(baseUri);
        this.cache.set(key, sources);
        return sources;
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions.length = 0;
        this.cache.clear();
        this.changed.dispose();
    }

    private forget(uri: vscode.Uri): void {
        this.cache.delete(uri.toString());
        this.changed.fire(uri);
    }

    private async read(baseUri: vscode.Uri): Promise<ReadonlyMap<string, string>> {
        try {
            const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(baseUri));
            const sources = new Map<string, string>();
            // The model goes out of scope here; only the map survives.
            for (const unit of iterateUnits(parseXliff(text))) {
                sources.set(unit.id, unit.source);
            }
            Logger.info(`Indexed ${sources.size} units from the base file ${baseUri.path}.`);
            return sources;
        } catch (error: unknown) {
            Logger.warn(`Could not index the base file ${baseUri.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
            return new Map();
        }
    }
}

export interface UnitComparison {
    readonly id: string;
    /** The base no longer has this id at all. */
    readonly orphaned?: boolean;
    /** The base's source, when it is not ours. Exact equality — a trailing space is a change. */
    readonly baseSource?: string;
}

/**
 * Compares one file's units against the base, returning **only** the ones that differ.
 *
 * A language file in step with its base yields nothing, which is the common case and the
 * reason this can be posted as a patch rather than as a whole document.
 */
export function compareToBase(
    units: readonly { readonly id: string; readonly source: string }[],
    baseSources: ReadonlyMap<string, string>,
): UnitComparison[] {
    const differences: UnitComparison[] = [];

    for (const unit of units) {
        const baseSource = baseSources.get(unit.id);
        if (baseSource === undefined) {
            differences.push({ id: unit.id, orphaned: true });
            continue;
        }
        if (baseSource !== unit.source) {
            differences.push({ id: unit.id, baseSource });
        }
    }

    return differences;
}

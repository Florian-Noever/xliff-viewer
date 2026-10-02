import * as vscode from 'vscode';

import { Logger } from './logger';
import { parseXliff } from '../xliff/parser';
import { iterateUnits } from '../../shared/model';

/**
 * What a base file says each unit's source is.
 *
 * Parsed on first need, keeping only an id → source map: a base file is as large as the
 * language file it pairs with. Cached per base-file URI and shared by every language file
 * that resolves to it.
 */
export class BaseFileIndex implements vscode.Disposable {
    private readonly cache = new Map<string, ReadonlyMap<string, string>>();
    private readonly changed = new vscode.EventEmitter<vscode.Uri>();

    /** A base file appeared, changed or went away, so the markers computed from it are stale. */
    public readonly onDidChange: vscode.Event<vscode.Uri> = this.changed.event;

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

    /** Drops what was read from a base file that appeared, changed or went away, and says so. */
    public forget(uri: vscode.Uri): void {
        this.cache.delete(uri.toString());
        this.changed.fire(uri);
    }

    public dispose(): void {
        this.cache.clear();
        this.changed.dispose();
    }

    private async read(baseUri: vscode.Uri): Promise<ReadonlyMap<string, string>> {
        try {
            const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(baseUri));
            const sources = new Map<string, string>();
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
 * Compares one file's units against the base, returning **only** the ones that differ: a
 * language file in step with its base yields nothing.
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

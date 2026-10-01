import * as vscode from 'vscode';

import { Logger } from './logger';
import { readSettings } from './settings';
import { appNameOf, fileNameOf } from './uriNames';
import { SETTINGS_SECTION } from '../../shared/settings';

/**
 * Finding the `.g.xlf` that pairs with a language file.
 *
 * Not finding one is **not a failure**. The viewer works fully without a base file; the
 * affordances that need one are simply disabled with a reason.
 */

const XLIFF_SYNC_SECTION = 'xliffSync';
const XLIFF_SYNC_BASE_FILE = 'baseFile';
const BASE_SUFFIX = '.g.xlf';
const TRANSLATIONS_GLOB = '**/Translations/*.g.xlf';

/** Where a resolved base file came from, so the log and the UI can say. */
export const BaseFileSource = {
    setting: 'xliffViewer.baseFile',
    xliffSync: 'xliffSync.baseFile',
    sibling: 'sibling .g.xlf',
    folder: 'any .g.xlf in the folder',
    translations: 'any .g.xlf under Translations/',
} as const;
export type BaseFileSource = typeof BaseFileSource[keyof typeof BaseFileSource];

export interface BaseFileResolution {
    /** Undefined when the workspace has none — which is a normal state, not an error. */
    readonly uri?: vscode.Uri;
    readonly source?: BaseFileSource;
}

const NONE: BaseFileResolution = {};

export class BaseFileResolver implements vscode.Disposable {
    private readonly cache = new Map<string, BaseFileResolution>();
    private readonly subscriptions: vscode.Disposable[] = [];

    public constructor() {
        this.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration(SETTINGS_SECTION) || event.affectsConfiguration(XLIFF_SYNC_SECTION)) {
                    this.invalidate();
                }
            }),
            // XLIFF Sync's workspace value starts to count.
            vscode.workspace.onDidGrantWorkspaceTrust(() => {
                this.invalidate();
            }),
        );
    }

    /**
     * Drops every cached answer; the next `resolve` starts over. A base file appearing,
     * moving or being deleted changes every answer, so this runs on each of those too.
     */
    public invalidate(): void {
        this.cache.clear();
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions.length = 0;
        this.cache.clear();
    }

    /**
     * `isBaseFile` short-circuits the whole thing: a `.g.xlf` has no base of its own, and
     * looking for one would resolve it to itself.
     */
    public async resolve(uri: vscode.Uri, isBaseFile: boolean): Promise<BaseFileResolution> {
        if (isBaseFile) {
            return NONE;
        }

        const key = uri.toString();
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const resolution = await this.search(uri);
        this.cache.set(key, resolution);

        Logger.info(resolution.uri === undefined
            ? `No base file found for ${uri.path}.`
            : `Base file for ${uri.path}: ${resolution.uri.path} (${resolution.source}).`);

        return resolution;
    }

    private async search(uri: vscode.Uri): Promise<BaseFileResolution> {
        const fromSetting = await this.fromOurSetting(uri);
        if (fromSetting !== undefined) {
            return { uri: fromSetting, source: BaseFileSource.setting };
        }

        const fromSync = await this.fromXliffSync(uri);
        if (fromSync !== undefined) {
            return { uri: fromSync, source: BaseFileSource.xliffSync };
        }

        // NAB AL Tools has no base-file setting to read: it finds the generated file by the
        // same conventions as the steps below.
        const folder = parentOf(uri);
        const siblings = await readFolder(folder);

        const sibling = `${appNameOf(uri)}${BASE_SUFFIX}`;
        if (siblings.includes(sibling)) {
            return { uri: vscode.Uri.joinPath(folder, sibling), source: BaseFileSource.sibling };
        }

        const anyInFolder = siblings.find(name => name.toLowerCase().endsWith(BASE_SUFFIX));
        if (anyInFolder !== undefined) {
            return { uri: vscode.Uri.joinPath(folder, anyInFolder), source: BaseFileSource.folder };
        }

        const inTranslations = await bestUnderTranslations(appNameOf(uri));
        return inTranslations === undefined ? NONE : { uri: inTranslations, source: BaseFileSource.translations };
    }

    /** Step 1: our own setting — an absolute path, a workspace-relative path, or a glob. */
    private async fromOurSetting(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        const configured = readSettings(uri).baseFile.trim();
        if (configured === '') {
            return undefined;
        }

        const direct = await firstExisting(candidatePaths(configured, uri));
        if (direct !== undefined) {
            return direct;
        }

        // Not a path, so treat it as a glob — `Translations/*.g.xlf` is a reasonable thing
        // for someone to have typed.
        return findFirst(configured);
    }

    /**
     * Step 2: XLIFF Sync's own setting, read defensively.
     *
     * A missing key, a renamed key or an unexpected type is "not configured", never an
     * error — and we never write it back.
     */
    private async fromXliffSync(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        const raw = xliffSyncBaseFile(uri);
        if (typeof raw !== 'string' || raw.trim() === '') {
            return undefined;
        }

        const configured = raw.trim();
        const direct = await firstExisting(candidatePaths(configured, uri));
        if (direct !== undefined) {
            return direct;
        }

        // Its default is the suffix `.g.xlf`, and it stores a bare file name once the user
        // answers its prompt. Either way, match it against the folder rather than give up.
        const folder = parentOf(uri);
        const names = await readFolder(folder);
        const match = names.find(name => name === configured)
            ?? names.find(name => name.toLowerCase().endsWith(configured.toLowerCase()));

        return match === undefined ? undefined : vscode.Uri.joinPath(folder, match);
    }
}

/**
 * XLIFF Sync's base-file setting. In Restricted Mode only the user's own value counts: the
 * manifest can restrict only this extension's settings, not another's.
 */
function xliffSyncBaseFile(uri: vscode.Uri): unknown {
    const configuration = vscode.workspace.getConfiguration(XLIFF_SYNC_SECTION, uri);
    return vscode.workspace.isTrusted
        ? configuration.get(XLIFF_SYNC_BASE_FILE)
        : configuration.inspect(XLIFF_SYNC_BASE_FILE)?.globalValue;
}

function parentOf(uri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(uri, '..');
}

/** A configured value could be absolute, or relative to the workspace, or to the document. */
function candidatePaths(configured: string, document: vscode.Uri): vscode.Uri[] {
    const candidates = [vscode.Uri.file(configured), vscode.Uri.joinPath(parentOf(document), configured)];
    const folder = vscode.workspace.getWorkspaceFolder(document);
    if (folder !== undefined) {
        candidates.push(vscode.Uri.joinPath(folder.uri, configured));
    }
    return candidates;
}

async function firstExisting(candidates: readonly vscode.Uri[]): Promise<vscode.Uri | undefined> {
    for (const candidate of candidates) {
        try {
            await vscode.workspace.fs.stat(candidate);
            return candidate;
        } catch {
            // Not there. The next candidate, or none — either way not a failure.
        }
    }
    return undefined;
}

async function readFolder(folder: vscode.Uri): Promise<string[]> {
    try {
        return (await vscode.workspace.fs.readDirectory(folder)).map(([name]) => name);
    } catch {
        return [];
    }
}

/**
 * The last resort searches the **whole workspace**, so in a workspace holding several apps
 * the first hit is as likely to belong to another one. A base file from the wrong app marks
 * every unit orphaned — a confidently wrong answer, which is worse than none. So the app's
 * own name decides among the candidates, and only a single candidate is taken on trust.
 */
async function bestUnderTranslations(appName: string): Promise<vscode.Uri | undefined> {
    let candidates: vscode.Uri[];
    try {
        candidates = await vscode.workspace.findFiles(TRANSLATIONS_GLOB);
    } catch {
        return undefined;
    }

    if (candidates.length <= 1) {
        return candidates[0];
    }

    const wanted = `${appName}${BASE_SUFFIX}`.toLowerCase();
    const named = candidates.find(candidate => fileNameOf(candidate).toLowerCase() === wanted);
    if (named !== undefined) {
        return named;
    }

    Logger.warn(`${candidates.length} base files are under Translations/ and none is named "${wanted}"; using ${candidates[0].path}.`);
    return candidates[0];
}

async function findFirst(glob: string): Promise<vscode.Uri | undefined> {
    try {
        const [first] = await vscode.workspace.findFiles(glob, undefined, 1);
        return first;
    } catch {
        return undefined;
    }
}

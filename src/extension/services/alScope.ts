import * as vscode from 'vscode';

import { Logger } from './logger';

/**
 * Where a translation file's AL source is: the app it belongs to.
 *
 * An AL app is the folder holding its `app.json`, and a translation file lives inside it —
 * usually in `Translations/`. Searching only that app keeps two apps of one workspace from
 * answering for each other. With no `app.json` above the file, the workspace folder is the
 * scope instead.
 */

export interface AlScope {
    /** The folder searched for AL files. */
    readonly folder: vscode.Uri;
    /** The app's preprocessor symbols, which decide its `#if` blocks. */
    readonly symbols: readonly string[];
}

const MANIFEST = 'app.json';
/** How far up to look for an app, when the file is in no workspace folder to stop at. */
const MAX_ASCENT = 32;

/** The app a file belongs to, else its workspace folder; undefined outside both. */
export async function alScopeFor(file: vscode.Uri): Promise<AlScope | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(file)?.uri;
    // A joined URI keeps the query, and for some file systems — `git:`, say — the query is
    // what names the file. Every `app.json` probed beside a diff would then "exist".
    let folder = vscode.Uri.joinPath(file.with({ query: '', fragment: '' }), '..');

    for (let step = 0; step < MAX_ASCENT; step++) {
        const manifest = vscode.Uri.joinPath(folder, MANIFEST);
        if (await isFile(manifest)) {
            return { folder, symbols: await readSymbols(manifest) };
        }
        const parent = vscode.Uri.joinPath(folder, '..');
        if (folder.toString() === workspaceFolder?.toString() || parent.path === folder.path) {
            break;
        }
        folder = parent;
    }

    return workspaceFolder === undefined ? undefined : { folder: workspaceFolder, symbols: [] };
}

async function isFile(uri: vscode.Uri): Promise<boolean> {
    try {
        // A bit set, not a value: a linked file is `File | SymbolicLink`.
        return ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File) !== 0;
    } catch {
        return false;
    }
}

/** `preprocessorSymbols` from an `app.json`, or none when it cannot be read. */
async function readSymbols(manifest: vscode.Uri): Promise<readonly string[]> {
    try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(manifest)));
        const symbols = typeof parsed === 'object' && parsed !== null ? (parsed as { readonly preprocessorSymbols?: unknown }).preprocessorSymbols : undefined;
        return Array.isArray(symbols) ? symbols.filter((symbol): symbol is string => typeof symbol === 'string') : [];
    } catch (error: unknown) {
        Logger.warn(`Could not read ${manifest.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
        return [];
    }
}

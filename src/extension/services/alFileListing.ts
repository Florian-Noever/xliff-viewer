import * as vscode from 'vscode';

import { Logger } from './logger';

/**
 * Every AL file under a folder, in both hosts.
 *
 * `findFiles` is the right tool — it honours the user's excludes, and on the desktop it is
 * fast — but a host whose file system has no search provider answers it with nothing, and
 * one whose provider gives up on a large folder answers the same. So when it finds nothing,
 * the folder is walked with `workspace.fs.readDirectory`, which every file system supports.
 */

export const AlListingPath = {
    search: 'search',
    walk: 'walk',
} as const;
export type AlListingPath = typeof AlListingPath[keyof typeof AlListingPath];

export interface AlListing {
    readonly files: readonly vscode.Uri[];
    /** Which way the files were found, which differs by host. */
    readonly via: AlListingPath;
}

/** Folders that hold no source of the app's own: dependencies, and any hidden folder. */
const SKIPPED = new Set(['node_modules']);
/** A walk stops here rather than reading an unbounded tree. */
const MAX_ENTRIES = 20000;

/** `.alpackages`, `.snapshots` and `.git` are hidden folders like any other. */
function isSkippedFolder(name: string): boolean {
    return name.startsWith('.') || SKIPPED.has(name);
}

/** Only the folders below the root count, so a root inside a hidden folder still lists. */
function skipped(path: string, root: vscode.Uri): boolean {
    return path.slice(root.path.length).split('/').slice(0, -1).some(isSkippedFolder);
}

export async function listAlFiles(folder: vscode.Uri): Promise<AlListing> {
    try {
        const found = (await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.al'))).filter(uri => !skipped(uri.path, folder));
        if (found.length > 0) {
            Logger.info(`Found ${found.length} AL files under ${folder.path} by search.`);
            return { files: found, via: AlListingPath.search };
        }
    } catch (error: unknown) {
        Logger.warn(`Could not search ${folder.path} for AL files: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const walked = await walkAlFiles(folder);
    Logger.info(`Found ${walked.length} AL files under ${folder.path} by walking the folder.`);
    return { files: walked, via: AlListingPath.walk };
}

/**
 * The AL files under a folder, read with `readDirectory` alone.
 *
 * Exported for the hosts' own tests: where search works, this path is never taken, and it
 * is the one a host without search depends on.
 */
export async function walkAlFiles(root: vscode.Uri): Promise<vscode.Uri[]> {
    const files: vscode.Uri[] = [];
    const pending = [root];
    let seen = 0;

    for (let folder = pending.shift(); folder !== undefined; folder = pending.shift()) {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(folder);
        } catch {
            continue;
        }
        for (const [name, type] of entries) {
            if (++seen > MAX_ENTRIES) {
                Logger.warn(`Stopped looking for AL files under ${root.path} after ${MAX_ENTRIES} entries.`);
                return files;
            }
            // A bit set, not a value. A linked folder is not followed — a link back up the tree
            // would be walked until the cap — but a linked file is read like any other.
            if ((type & vscode.FileType.Directory) !== 0) {
                if ((type & vscode.FileType.SymbolicLink) === 0 && !isSkippedFolder(name)) {
                    pending.push(vscode.Uri.joinPath(folder, name));
                }
            } else if ((type & vscode.FileType.File) !== 0 && name.toLowerCase().endsWith('.al')) {
                files.push(vscode.Uri.joinPath(folder, name));
            }
        }
    }

    return files;
}

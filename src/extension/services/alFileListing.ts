import * as vscode from 'vscode';

import { Logger } from './logger';

/**
 * Every AL file under a folder, in both hosts.
 *
 * `findFiles` is the right tool — it honours the user's excludes, and on the desktop it is
 * fast — but a host whose file system has no search provider answers it with nothing. So
 * when it finds nothing, the folder is walked with `workspace.fs.readDirectory`, which every
 * file system supports.
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

/** Folders that hold no source of the app's own: dependencies, snapshots, tooling. */
const SKIPPED = new Set(['node_modules', '.alpackages', '.snapshots', '.git']);
/** A walk stops here rather than reading an unbounded tree. */
const MAX_ENTRIES = 20000;

function skipped(path: string, root: vscode.Uri): boolean {
    return path.slice(root.path.length).split('/').some(segment => SKIPPED.has(segment));
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

    const walked = await walk(folder);
    Logger.info(`Found ${walked.length} AL files under ${folder.path} by walking the folder.`);
    return { files: walked, via: AlListingPath.walk };
}

async function walk(root: vscode.Uri): Promise<vscode.Uri[]> {
    const files: vscode.Uri[] = [];
    const pending = [root];
    let seen = 0;

    while (pending.length > 0) {
        const folder = pending.shift();
        if (folder === undefined) {
            break;
        }
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
            if (type === vscode.FileType.Directory) {
                if (!name.startsWith('.') && !SKIPPED.has(name)) {
                    pending.push(vscode.Uri.joinPath(folder, name));
                }
            } else if (name.toLowerCase().endsWith('.al')) {
                files.push(vscode.Uri.joinPath(folder, name));
            }
        }
    }

    return files;
}

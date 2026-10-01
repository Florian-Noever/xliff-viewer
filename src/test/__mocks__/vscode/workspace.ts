/** The `workspace` namespace: one workspace folder, and the parts the other modules model. */

import { getConfiguration, isTrusted, onDidChangeConfiguration, onDidGrantWorkspaceTrust } from './configuration';
import { applyEdit, onDidChangeTextDocument, openTextDocument, textDocuments } from './documents';
import { createFileSystemWatcher, fs, virtualFilePaths } from './fileSystem';
import { globMatcher, isWithin, relativeMatcher, Uri, withoutTrailingSlash } from './uri';

import type { RelativePattern } from './uri';

let workspaceRoot: Uri | undefined;
let searchAvailable = true;

/**
 * Which paths a search pattern selects. A string glob is read relative to the workspace
 * folder, as VS Code reads it, so with no folder it selects nothing.
 */
function searchMatcher(pattern: string | RelativePattern): (path: string) => boolean {
    if (typeof pattern !== 'string') {
        return relativeMatcher(pattern);
    }
    if (workspaceRoot === undefined) {
        return () => false;
    }
    const base = `${withoutTrailingSlash(workspaceRoot.path)}/`;
    const matches = globMatcher(pattern);
    return path => path.startsWith(base) && matches(path.slice(base.length));
}

/** The virtual files a pattern selects; none when search is off, as in a host without a search provider. */
function findFiles(pattern: string | RelativePattern, _exclude?: unknown, maxResults?: number): Promise<Uri[]> {
    if (!searchAvailable) {
        return Promise.resolve([]);
    }
    const found = virtualFilePaths().filter(searchMatcher(pattern)).map(path => Uri.file(path));
    return Promise.resolve(maxResults === undefined ? found : found.slice(0, maxResults));
}

export const workspace = {
    openTextDocument,
    get textDocuments(): { uri: Uri; getText(): string }[] {
        return textDocuments();
    },
    getConfiguration,
    get isTrusted(): boolean {
        return isTrusted();
    },
    onDidGrantWorkspaceTrust,
    fs,
    createFileSystemWatcher,
    /** The folder only for a URI inside it, as the real one answers. */
    getWorkspaceFolder: (uri: Uri): { uri: Uri } | undefined =>
        (workspaceRoot?.scheme === uri.scheme && isWithin(uri.path, workspaceRoot.path) ? { uri: workspaceRoot } : undefined),
    asRelativePath: (pathOrUri: Uri | string): string => {
        const path = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.path;
        return workspaceRoot !== undefined && isWithin(path, workspaceRoot.path) && path !== workspaceRoot.path
            ? path.slice(withoutTrailingSlash(workspaceRoot.path).length + 1)
            : path;
    },
    findFiles,
    applyEdit,
    onDidChangeTextDocument,
    onDidChangeConfiguration,
};

/** Sets the single workspace folder `getWorkspaceFolder` reports, and `findFiles` searches. */
export function setWorkspaceRoot(path: string | undefined): void {
    workspaceRoot = path === undefined ? undefined : Uri.file(path);
}

/** Whether `findFiles` finds anything — off, as in a host with no search provider. */
export function setSearchAvailable(available: boolean): void {
    searchAvailable = available;
}

export function resetWorkspace(): void {
    workspaceRoot = undefined;
    searchAvailable = true;
}

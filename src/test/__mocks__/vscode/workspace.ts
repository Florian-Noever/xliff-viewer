/** The `workspace` namespace: one workspace folder, and the parts the other modules model. */

import { getConfiguration, isTrusted, onDidChangeConfiguration, onDidGrantWorkspaceTrust } from './configuration';
import { applyEdit, onDidChangeTextDocument, openTextDocument, textDocuments } from './documents';
import { createFileSystemWatcher, findFiles, fs } from './fileSystem';
import { isWithin, Uri, withoutTrailingSlash } from './uri';

let workspaceRoot: Uri | undefined;

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

/** Sets the single workspace folder `getWorkspaceFolder` reports. */
export function setWorkspaceRoot(path: string | undefined): void {
    workspaceRoot = path === undefined ? undefined : Uri.file(path);
}

export function resetWorkspace(): void {
    workspaceRoot = undefined;
}

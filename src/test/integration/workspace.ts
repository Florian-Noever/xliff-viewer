import * as vscode from 'vscode';

import { assertOk } from './assertions';

/** A path in the workspace the integration tests open: the repository itself. */
export function workspaceUri(...segments: string[]): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    assertOk(folders && folders.length > 0, 'no workspace folder is open');
    return vscode.Uri.joinPath(folders[0].uri, ...segments);
}

/** Where the XLIFF corpus lies in the workspace. */
export const XLIFF_FIXTURE_FOLDER: readonly string[] = ['src', 'test', 'fixtures', 'xliff'];

export const fixtureUri = (name: string): vscode.Uri => workspaceUri(...XLIFF_FIXTURE_FOLDER, name);

/**
 * The visible editor showing a document. Compared by `toString()`, not `path`: on Windows the
 * drive letter's case differs between a joined URI and the one the host hands back.
 */
export function editorFor(uri: vscode.Uri): vscode.TextEditor | undefined {
    const wanted = uri.toString();
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === wanted);
}

export async function closeEverything(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

/** Where the tests that write files write them: git-ignored, and left out of the package. */
function scratchFolder(): vscode.Uri {
    return workspaceUri('out', 'test', 'scratch');
}

export const scratchUri = (name: string): vscode.Uri => vscode.Uri.joinPath(scratchFolder(), name);

/** A file that is already gone needs no cleaning up; any other failure is the test's. */
function rethrowUnlessMissing(error: unknown): void {
    if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) {
        throw error;
    }
}

/** An empty scratch folder, whatever an interrupted run left in it. */
export async function resetScratch(): Promise<void> {
    try {
        await vscode.workspace.fs.delete(scratchFolder(), { recursive: true, useTrash: false });
    } catch (error) {
        rethrowUnlessMissing(error);
    }
    await vscode.workspace.fs.createDirectory(scratchFolder());
}

/** Writes a scratch file and shows it in a text editor. */
export async function openScratch(name: string, text: string): Promise<{ uri: vscode.Uri; document: vscode.TextDocument }> {
    const uri = scratchUri(name);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
    return { uri, document };
}

/**
 * Reverts every document a test left dirty, closes every editor, and deletes the scratch file.
 * A dirty document outlives its editor, and the host would try to save it on the way out.
 */
export async function discard(uri: vscode.Uri): Promise<void> {
    for (const document of vscode.workspace.textDocuments.filter(each => each.isDirty)) {
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('workbench.action.files.revert');
    }
    await closeEverything();
    try {
        await vscode.workspace.fs.delete(uri);
    } catch (error) {
        rethrowUnlessMissing(error);
    }
}

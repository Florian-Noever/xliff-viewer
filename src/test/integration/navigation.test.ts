import * as vscode from 'vscode';

import { BaseFileResolver } from '../../extension/services/baseFileResolver';
import { findUnitOffset, revealAsText, revealInBaseFile } from '../../extension/services/navigation';
import { idOf } from '../fixtures/corpus';

import { assertEqual, assertOk } from './assertions';

/**
 * Navigation against a workspace that **lacks** what it needs.
 *
 * These services touch the workspace rather than one document, and `workspace.fs`,
 * `readDirectory` and `findFiles` are exactly where the web host differs from the desktop
 * one. Compiling for both proves nothing about either — so this suite runs in both, and the
 * repository itself is the fixture: a base file that pairs, a unit the base file does not
 * carry, and a base file that is not there at all.
 */

const KNOWN_UNIT = idOf([{ type: 'Table', name: 'Contoso Setup' }, { type: 'Property', name: 'Caption' }]);

function workspaceUri(...segments: string[]): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    assertOk(folders && folders.length > 0, 'no workspace folder is open');
    return vscode.Uri.joinPath(folders[0].uri, ...segments);
}

function editorFor(uri: vscode.Uri): vscode.TextEditor | undefined {
    const wanted = uri.toString();
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === wanted);
}

async function closeEverything(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

suite('navigation, in whichever host this is', () => {
    test('resolves a sibling base file through workspace.fs', async () => {
        const resolver = new BaseFileResolver();
        try {
            const resolved = await resolver.resolve(workspaceUri('src', 'test', 'fixtures', 'xliff', 'Contoso App.de-DE.xlf'), false);

            assertOk(resolved.uri, 'no base file resolved for Contoso App.de-DE.xlf');
            assertEqual(resolved.source, 'sibling .g.xlf', 'resolved by the wrong step');
            assertOk(resolved.uri.path.endsWith('Contoso App.g.xlf'), `resolved to ${resolved.uri.path}`);
        } finally {
            resolver.dispose();
        }
    });

    test('a base file resolves to nothing rather than to itself', async () => {
        const resolver = new BaseFileResolver();
        try {
            const resolved = await resolver.resolve(workspaceUri('src', 'test', 'fixtures', 'xliff', 'Contoso App.g.xlf'), true);
            assertEqual(resolved.uri, undefined, 'a base file must not resolve a base file');
        } finally {
            resolver.dispose();
        }
    });

    test('reveals a unit in the base file, and says no for one it does not carry', async () => {
        const base = workspaceUri('src', 'test', 'fixtures', 'xliff', 'Contoso App.g.xlf');

        assertEqual(await revealInBaseFile(base, KNOWN_UNIT), true, 'the base file should carry this unit');
        assertEqual(await revealInBaseFile(base, 'Table 1 - Property 1'), false, 'an absent unit must report absent');

        await closeEverything();
    });

    test('says no, rather than throwing, for a base file that is not there', async () => {
        const missing = workspaceUri('src', 'test', 'fixtures', 'xliff', 'Nothing.g.xlf');
        assertEqual(await revealInBaseFile(missing, KNOWN_UNIT), false, 'a missing base file must be a "no"');
    });

    test('opens the raw XML with the built-in editor, for every unit', async () => {
        const uri = workspaceUri('src', 'test', 'fixtures', 'xliff', 'Contoso App.de-DE.xlf');
        await revealAsText(uri, KNOWN_UNIT);

        // `toString()`, not `path`: on Windows the drive letter's case differs between a
        // joined URI and the one the host hands back, and only `toString()` normalises it.
        const editor = editorFor(uri);
        assertOk(editor, 'the file did not open as text');

        const offset = findUnitOffset(editor.document.getText(), KNOWN_UNIT);
        assertOk(offset !== undefined, 'the unit was not found in the text');
        assertEqual(editor.selection.active.line, editor.document.positionAt(offset).line, 'the cursor is not on the unit');

        await closeEverything();
    });

    test('opens the document itself when no unit is named — the error pane\'s escape hatch', async () => {
        const uri = workspaceUri('src', 'test', 'fixtures', 'xliff', 'minimal.xlf');
        await revealAsText(uri);

        assertOk(editorFor(uri), 'the file did not open as text');

        await closeEverything();
    });
});

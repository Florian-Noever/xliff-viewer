import * as vscode from 'vscode';

import { AlObjectIndex } from '../../extension/services/alObjectIndex';
import { BaseFileResolver } from '../../extension/services/baseFileResolver';
import { AlNavigationOutcome, findUnitLine, revealAlObject, revealAsText, revealInBaseFile } from '../../extension/services/navigation';

import { assertEqual, assertOk } from './assertions';

/**
 * `REVIEW-02a`: navigation against a workspace that **lacks** what it needs.
 *
 * These are the first services that touch the workspace rather than one document, and
 * `workspace.fs`, `readDirectory` and `findFiles` are exactly where the web host differs
 * from the desktop one. Compiling for both proves nothing about either — so this suite
 * runs in both, and the repository itself is the fixture: it has `.g.xlf` files and no AL
 * source at all, which is the degraded case §10.1 must state a reason for.
 */

const KNOWN_UNIT = 'Table 3783554337 - Property 2879900210';

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
            const resolved = await resolver.resolve(workspaceUri('Examples', 'Contoso App.de-DE.xlf'), false);

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
            const resolved = await resolver.resolve(workspaceUri('Examples', 'Contoso App.g.xlf'), true);
            assertEqual(resolved.uri, undefined, 'a base file must not resolve a base file');
        } finally {
            resolver.dispose();
        }
    });

    test('reveals a unit in the base file, and says no for one it does not carry', async () => {
        const base = workspaceUri('Examples', 'Contoso App.g.xlf');

        assertEqual(await revealInBaseFile(base, KNOWN_UNIT), true, 'the base file should carry this unit');
        assertEqual(await revealInBaseFile(base, 'Table 1 - Property 1'), false, 'an absent unit must report absent');

        await closeEverything();
    });

    test('says no, rather than throwing, for a base file that is not there', async () => {
        const missing = workspaceUri('Examples', 'Nothing.g.xlf');
        assertEqual(await revealInBaseFile(missing, KNOWN_UNIT), false, 'a missing base file must be a "no"');
    });

    test('opens the raw XML with the built-in editor, for every unit', async () => {
        const uri = workspaceUri('Examples', 'Contoso App.de-DE.xlf');
        await revealAsText(uri, KNOWN_UNIT);

        // `toString()`, not `path`: on Windows the drive letter's case differs between a
        // joined URI and the one the host hands back, and only `toString()` normalises it.
        const editor = editorFor(uri);
        assertOk(editor, 'the file did not open as text');

        const line = findUnitLine(editor.document.getText(), KNOWN_UNIT);
        assertOk(line !== undefined, 'the unit was not found in the text');
        assertEqual(editor.selection.active.line, line, 'the cursor is not on the unit');

        await closeEverything();
    });

    test('opens the document itself when no unit is named — the error pane\'s escape hatch', async () => {
        const uri = workspaceUri('Examples', 'test.xlf');
        await revealAsText(uri);

        assertOk(editorFor(uri), 'the file did not open as text');

        await closeEverything();
    });

    test('reports a workspace with no AL source instead of failing silently', async () => {
        const index = new AlObjectIndex();
        try {
            // This repository is a VS Code extension: it has translation files and no AL.
            assertEqual(await index.hasAlFiles(), false, 'this workspace should contain no .al files');
            assertEqual(
                await revealAlObject(index, { kind: 'Table', name: '3S Sales Header' }),
                AlNavigationOutcome.noAlFiles,
                'an AL-less workspace must be told apart from a missing object',
            );
            assertEqual((await index.find('Table', '3S Sales Header')).length, 0, 'nothing should be indexed');
        } finally {
            index.dispose();
        }
    });
});

import * as vscode from 'vscode';

import { assertArrayEqual, assertContains, assertEqual, assertOk } from './assertions';

const VIEW_TYPE = 'xliff-viewer.editor';
const EXTENSION_NAME = 'xliff-viewer';

interface CustomEditorContribution {
    readonly viewType: string;
    readonly priority: string;
    readonly selector: { readonly filenamePattern: string }[];
}

function findExtension(): vscode.Extension<unknown> {
    const extension = vscode.extensions.all.find(
        candidate => (candidate.packageJSON as { name?: string }).name === EXTENSION_NAME
    );
    assertOk(extension, 'xliff-viewer extension not found in the host');
    return extension;
}

function fixtureUri(): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    assertOk(folders && folders.length > 0, 'no workspace folder is open');
    return vscode.Uri.joinPath(folders[0].uri, 'Examples', 'test.xlf');
}

suite('XLIFF custom editor', () => {
    test('the extension activates', async () => {
        const extension = findExtension();
        await extension.activate();
        assertEqual(extension.isActive, true, 'extension did not activate');
    });

    test('contributes the custom editor for .xlf and .xliff', () => {
        const contributes = (findExtension().packageJSON as {
            contributes?: { customEditors?: CustomEditorContribution[] };
        }).contributes;
        const editors = contributes?.customEditors;
        assertOk(editors, 'no customEditors contribution');
        assertEqual(editors.length, 1, 'expected exactly one custom editor');
        assertEqual(editors[0].viewType, VIEW_TYPE, 'wrong viewType');
        // Must stay "default" or "Reopen with Text Editor" disappears (§8.1).
        assertEqual(editors[0].priority, 'default', 'priority must be "default"');
        assertArrayEqual(
            editors[0].selector.map(entry => entry.filenamePattern).sort(),
            ['*.xlf', '*.xliff'],
            'wrong selector patterns'
        );
    });

    test('opens a fixture with the custom editor', async () => {
        await vscode.commands.executeCommand('vscode.openWith', fixtureUri(), VIEW_TYPE);

        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assertOk(activeTab, 'no active tab after opening the fixture');
        assertEqual(activeTab.label, 'test.xlf', 'unexpected active tab');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('the same fixture still opens as plain text', async () => {
        const document = await vscode.workspace.openTextDocument(fixtureUri());
        assertContains(document.getText(), '<xliff', 'fixture did not load as XLIFF text');
        assertOk(document.getText().length > 0, 'fixture is empty');
    });
});

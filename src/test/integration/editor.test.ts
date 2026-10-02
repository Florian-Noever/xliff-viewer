import * as vscode from 'vscode';

import { FIXTURE } from '../fixtures/corpus';
import { parseXliff } from '../../extension/xliff/parser';
import { validateStructure } from '../../extension/xliff/validate';
import { assertArrayEqual, assertContains, assertEqual, assertOk } from './assertions';
import { fixtureUri, workspaceUri, XLIFF_FIXTURE_FOLDER } from './workspace';

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


/** Every fixture in the folder, so a new one is opened without being listed here. */
async function fixtureNames(): Promise<string[]> {
    const entries = await vscode.workspace.fs.readDirectory(workspaceUri(...XLIFF_FIXTURE_FOLDER));
    const names = entries.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.xlf')).map(([name]) => name);
    assertOk(names.includes(FIXTURE.minimal), 'the fixture folder did not list its files');
    return names.sort();
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
        // "default" opens .xlf files in the viewer.
        assertEqual(editors[0].priority, 'default', 'priority must be "default"');
        assertArrayEqual(
            editors[0].selector.map(entry => entry.filenamePattern).sort(),
            ['*.xlf', '*.xliff'],
            'wrong selector patterns'
        );
    });

    test('opens every fixture in this custom editor, and every fixture parses', async () => {
        for (const name of await fixtureNames()) {
            const uri = fixtureUri(name);
            await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
            try {
                const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
                assertOk(input instanceof vscode.TabInputCustom, `${name} did not open in a custom editor`);
                assertEqual(input.viewType, VIEW_TYPE, `${name} opened in another custom editor`);

                const text = (await vscode.workspace.openTextDocument(uri)).getText();
                validateStructure(parseXliff(text));
            } finally {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
        }
    });

    test('every fixture still opens as plain text', async () => {
        for (const name of await fixtureNames()) {
            const document = await vscode.workspace.openTextDocument(fixtureUri(name));
            assertContains(document.getText(), '<xliff', `${name} did not load as XLIFF text`);
        }
    });
});

import * as vscode from 'vscode';

import { XliffDocumentSession } from '../../extension/editor/documentSession';
import { createDocumentSession } from '../../extension/editor/documentView';

import { assertEqual, assertOk } from './assertions';

/**
 * `EDIT-01` in a real host.
 *
 * Dirty state, undo and what lands on disk all come from VS Code rather than from us
 * (`DEC-001`), so the only way to know they work is to ask the editor. The mocked host
 * tests cover which edit is produced; this covers what the editor does with it.
 *
 * Writes to a scratch file it creates and deletes, never to the corpus.
 */

const UNIT = 'Table 1 - Property 2';

const ORIGINAL = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="App">
    <body>
      <trans-unit id="${UNIT}" translate="yes" xml:space="preserve">
        <source>ExampleSourceText</source>
        <target state="translated">ExampleTranslation</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

function scratchUri(name: string): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    assertOk(folders && folders.length > 0, 'no workspace folder is open');
    return vscode.Uri.joinPath(folders[0].uri, name);
}

async function openScratch(name: string): Promise<{ uri: vscode.Uri; document: vscode.TextDocument }> {
    const uri = scratchUri(name);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(ORIGINAL));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
    return { uri, document };
}

async function discard(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    try {
        await vscode.workspace.fs.delete(uri);
    } catch {
        // Already gone; nothing to clean up.
    }
}

suite('editing a target, in a real host', () => {
    test('marks the document dirty and changes only the target', async () => {
        const { uri, document } = await openScratch('edit-dirty.xlf');
        const session = new XliffDocumentSession(document);
        try {
            await createDocumentSession(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');

            assertEqual(document.isDirty, true, 'the document should be dirty after an edit');
            assertEqual(
                document.getText(),
                ORIGINAL.replace('ExampleTranslation', 'EditedTranslation'),
                'the edit changed something other than the target',
            );
        } finally {
            session.dispose();
            await discard(uri);
        }
    });

    test('undo restores the previous text exactly', async () => {
        const { uri, document } = await openScratch('edit-undo.xlf');
        const session = new XliffDocumentSession(document);
        try {
            await createDocumentSession(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');
            await vscode.commands.executeCommand('undo');

            assertEqual(document.getText(), ORIGINAL, 'undo did not restore the original text');
        } finally {
            session.dispose();
            await discard(uri);
        }
    });

    test('saving writes bytes that differ only inside the target', async () => {
        const { uri, document } = await openScratch('edit-save.xlf');
        const session = new XliffDocumentSession(document);
        try {
            await createDocumentSession(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');
            assertEqual(await document.save(), true, 'the document did not save');

            const saved = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
            assertEqual(saved, ORIGINAL.replace('ExampleTranslation', 'EditedTranslation'), 'the saved bytes are not what was expected');
        } finally {
            session.dispose();
            await discard(uri);
        }
    });

    test('setting a target to what it already says leaves the document clean', async () => {
        const { uri, document } = await openScratch('edit-noop.xlf');
        const session = new XliffDocumentSession(document);
        try {
            await createDocumentSession(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'ExampleTranslation');

            assertEqual(document.isDirty, false, 'an edit that changes nothing must not dirty the document');
            assertEqual(document.getText(), ORIGINAL, 'the text should be untouched');
        } finally {
            session.dispose();
            await discard(uri);
        }
    });

    test('refuses to edit a base file, and leaves it alone (DEC-011)', async () => {
        const base = scratchUri('edit-base.g.xlf');
        await vscode.workspace.fs.writeFile(base, new TextEncoder().encode(ORIGINAL));
        const document = await vscode.workspace.openTextDocument(base);
        const session = new XliffDocumentSession(document);
        try {
            await createDocumentSession(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');

            assertEqual(document.isDirty, false, 'a base file must not be edited');
            assertEqual(document.getText(), ORIGINAL, 'a base file must not be changed');
        } finally {
            session.dispose();
            await discard(base);
        }
    });
});

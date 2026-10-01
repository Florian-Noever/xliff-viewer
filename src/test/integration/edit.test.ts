import * as vscode from 'vscode';

import { XliffDocumentSession } from '../../extension/editor/documentSession';
import { XliffDocumentView } from '../../extension/editor/documentView';
import { ExtensionMessageType } from '../../shared/messages';

import { assertEqual, assertOk } from './assertions';

/**
 * Dirty state, undo and what lands on disk all come from VS Code rather than from us, so
 * the only way to know they work is to ask the editor. The mocked host tests cover which
 * edit is produced; this covers what the editor does with it.
 *
 * Writes to a scratch file it creates and deletes, never to a fixture.
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

/** A file with a BOM, CRLF throughout, and a target to edit. */
const BOM = '﻿';
const CRLF_WITH_BOM = BOM + ORIGINAL.split('\n').join('\r\n');

suite('what a real host does to a file we did not write by hand', () => {
    test('keeps the CRLF and changes only the target, on a file with a BOM', async () => {
        // `getText()` does not hand back the BOM, so we never see one and never write one.
        // What lands on disk is the editor's business; the next test pins that this host drops it.
        const uri = scratchUri('edit-bom.xlf');
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(CRLF_WITH_BOM));
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
        const session = new XliffDocumentSession(document);

        try {
            assertEqual(document.getText().startsWith(BOM), false, 'getText should not carry the BOM');
            await new XliffDocumentView(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');
            assertEqual(await document.save(), true, 'the document did not save');

            const saved = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
            const expected = CRLF_WITH_BOM.replace('ExampleTranslation', 'EditedTranslation');

            // Everything that is ours: the CRLF, and only the target changed.
            assertEqual(saved.split('\r\n').length, expected.split('\r\n').length, 'the line endings changed');
            assertEqual(saved, expected.slice(saved.startsWith(BOM) ? 0 : 1), 'more than the target changed');
        } finally {
            session.dispose();
            await discard(uri);
        }
    });

    test('the host, not this extension, is what decides the BOM', async () => {
        // VS Code reports the document as `utf8bom` and still saves it without one. A raw
        // WorkspaceEdit with none of our code in it does the same, so the behaviour is the host's.
        const uri = scratchUri('edit-bom-host.xlf');
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(CRLF_WITH_BOM));
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });

        try {
            assertEqual(document.encoding, 'utf8bom', 'the host did not detect the BOM');

            const at = document.getText().indexOf('ExampleTranslation');
            const raw = new vscode.WorkspaceEdit();
            raw.replace(uri, new vscode.Range(document.positionAt(at), document.positionAt(at + 1)), 'X');
            await vscode.workspace.applyEdit(raw);
            await document.save();

            const saved = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
            assertEqual(saved.startsWith(BOM), false, 'the host now keeps the BOM, so the BOM warning on edit can be revisited');
        } finally {
            await discard(uri);
        }
    });

    test('writes a target needing re-encoding without mangling it', async () => {
        const { uri, document } = await openScratch('edit-entities.xlf');
        const session = new XliffDocumentSession(document);
        try {
            await new XliffDocumentView(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'A & B < C > D "quoted"');
            assertEqual(await document.save(), true, 'the document did not save');

            const saved = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
            assertOk(saved.includes('<target state="translated">A &amp; B &lt; C &gt; D "quoted"</target>'), `unexpected: ${saved}`);

            // And it survives being read back: the round trip is what makes it safe.
            const reopened = await vscode.workspace.openTextDocument(uri);
            assertOk(reopened.getText().includes('&amp;'), 'the entity did not survive');
        } finally {
            session.dispose();
            await discard(uri);
        }
    });

    test('leaves a file alone that is opened and closed without an edit', async () => {
        // A file whose formatting is not ours must not be reformatted merely by being
        // looked at.
        const odd = '<?xml version="1.0"?>\n<xliff version=\'1.2\'><file source-language=\'en-US\' '
            + 'target-language="de-DE"><body><trans-unit id="A"><source>S</source>'
            + '<target state="translated">T</target></trans-unit></body></file></xliff>';
        const uri = scratchUri('edit-untouched.xlf');
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(odd));
        const document = await vscode.workspace.openTextDocument(uri);
        const session = new XliffDocumentSession(document);

        try {
            session.current();
            assertEqual(document.isDirty, false, 'merely parsing a file must not dirty it');
            assertEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)), odd, 'the file changed on disk');
        } finally {
            session.dispose();
            await discard(uri);
        }
    });
});

suite('editing a target, in a real host', () => {
    test('marks the document dirty and changes only the target', async () => {
        const { uri, document } = await openScratch('edit-dirty.xlf');
        const session = new XliffDocumentSession(document);
        try {
            await new XliffDocumentView(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');

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

    test('writes a line break in a target with the file\'s own line ending, and answers with a patch', async () => {
        const uri = scratchUri('edit-lines.xlf');
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(ORIGINAL.split('\n').join('\r\n')));
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
        const session = new XliffDocumentSession(document);
        const posted: string[] = [];
        const view = new XliffDocumentView(session, message => posted.push(message.type));
        const attached = session.attach((change) => {
            view.apply(change);
        });

        try {
            await view.updateTarget({ fileIndex: 0, unitId: UNIT }, 'Zeile eins\nZeile zwei');
            assertOk(await document.save(), 'save did not succeed');
            const saved = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));

            assertEqual(/(?<!\r)\n/.test(document.getText()), false, 'the document holds a line feed without a carriage return');
            assertEqual(/(?<!\r)\n/.test(saved), false, 'the saved file holds a line feed without a carriage return');
            assertOk(saved.includes('Zeile eins\r\nZeile zwei'), 'the target was not written');
            assertEqual(posted.join(), ExtensionMessageType.patchUnits, 'the edit was not answered with one patch');
        } finally {
            attached.dispose();
            session.dispose();
            await discard(uri);
        }
    });

    test('undo restores the previous text exactly', async () => {
        const { uri, document } = await openScratch('edit-undo.xlf');
        const session = new XliffDocumentSession(document);
        try {
            await new XliffDocumentView(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');
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
            await new XliffDocumentView(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');
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
            await new XliffDocumentView(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'ExampleTranslation');

            assertEqual(document.isDirty, false, 'an edit that changes nothing must not dirty the document');
            assertEqual(document.getText(), ORIGINAL, 'the text should be untouched');
        } finally {
            session.dispose();
            await discard(uri);
        }
    });

    test('refuses to edit a base file, and leaves it alone', async () => {
        const base = scratchUri('edit-base.g.xlf');
        await vscode.workspace.fs.writeFile(base, new TextEncoder().encode(ORIGINAL));
        const document = await vscode.workspace.openTextDocument(base);
        const session = new XliffDocumentSession(document);
        try {
            await new XliffDocumentView(session, () => { }).updateTarget({ fileIndex: 0, unitId: UNIT }, 'EditedTranslation');

            assertEqual(document.isDirty, false, 'a base file must not be edited');
            assertEqual(document.getText(), ORIGINAL, 'a base file must not be changed');
        } finally {
            session.dispose();
            await discard(base);
        }
    });
});

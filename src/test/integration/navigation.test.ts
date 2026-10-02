import { hashedIdOf } from '../fixtures/alApp';
import { FIXTURE } from '../fixtures/corpus';
import { BaseFileResolver } from '../../extension/services/baseFileResolver';
import { findUnitOffset, revealAsText, revealInBaseFile } from '../../extension/services/navigation';
import { assertEqual, assertOk } from './assertions';
import { closeEverything, editorFor, fixtureUri } from './workspace';

/**
 * Navigation against a workspace that **lacks** what it needs.
 *
 * These services touch the workspace rather than one document, and `workspace.fs`,
 * `readDirectory` and `findFiles` are exactly where the web host differs from the desktop
 * one. Compiling for both proves nothing about either — so this suite runs in both, and the
 * repository itself is the fixture: a base file that pairs, a unit the base file does not
 * carry, and a base file that is not there at all.
 */

const KNOWN_UNIT = hashedIdOf([{ type: 'Table', name: 'Contoso Setup' }, { type: 'Property', name: 'Caption' }]);

suite('navigation, in whichever host this is', () => {
    test('resolves a sibling base file through workspace.fs', async () => {
        const resolver = new BaseFileResolver();
        try {
            const resolved = await resolver.resolve(fixtureUri(FIXTURE.german), false);

            assertOk(resolved.uri, 'no base file resolved for Contoso App.de-DE.xlf');
            assertEqual(resolved.source, 'sibling .g.xlf', 'resolved by the wrong step');
            assertOk(resolved.uri.path.endsWith(FIXTURE.base), `resolved to ${resolved.uri.path}`);
        } finally {
            resolver.dispose();
        }
    });

    test('a base file resolves to nothing rather than to itself', async () => {
        const resolver = new BaseFileResolver();
        try {
            const resolved = await resolver.resolve(fixtureUri(FIXTURE.base), true);
            assertEqual(resolved.uri, undefined, 'a base file must not resolve a base file');
        } finally {
            resolver.dispose();
        }
    });

    test('reveals a unit in the base file, and says no for one it does not carry', async () => {
        const base = fixtureUri(FIXTURE.base);

        assertEqual(await revealInBaseFile(base, KNOWN_UNIT), true, 'the base file should carry this unit');
        assertEqual(await revealInBaseFile(base, 'Table 1 - Property 1'), false, 'an absent unit must report absent');

        await closeEverything();
    });

    test('says no, rather than throwing, for a base file that is not there', async () => {
        const missing = fixtureUri('Nothing.g.xlf');
        assertEqual(await revealInBaseFile(missing, KNOWN_UNIT), false, 'a missing base file must be a "no"');
    });

    test('opens the raw XML with the built-in editor, at the unit\'s line', async () => {
        const uri = fixtureUri(FIXTURE.german);
        await revealAsText(uri, KNOWN_UNIT);

        const editor = editorFor(uri);
        assertOk(editor, 'the file did not open as text');

        const offset = findUnitOffset(editor.document.getText(), KNOWN_UNIT);
        assertOk(offset !== undefined, 'the unit was not found in the text');
        assertEqual(editor.selection.active.line, editor.document.positionAt(offset).line, 'the cursor is not on the unit');

        await closeEverything();
    });

    test('opens the document itself when no unit is named — the error pane\'s escape hatch', async () => {
        const uri = fixtureUri(FIXTURE.minimal);
        await revealAsText(uri);

        assertOk(editorFor(uri), 'the file did not open as text');

        await closeEverything();
    });
});

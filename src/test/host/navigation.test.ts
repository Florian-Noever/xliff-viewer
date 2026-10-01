import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findUnitOffset, revealAsText, revealInBaseFile } from '../../extension/services/navigation';
import { Logger } from '../../extension/services/logger';
import { FakeTextDocument, flushExecutedCommands, flushLogs, resetMocks, setVirtualFile } from '../__mocks__/vscode';

/**
 * There are no offsets in the model, so a unit's line is found by searching the text —
 * which makes *what* is searched for the whole story.
 */

const DOCUMENT = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<xliff version="1.2">',
    '  <file source-language="en-US" target-language="de-DE">',
    '    <body>',
    '      <group id="body">',
    '        <trans-unit id="Table 1 - Property 2" size-unit="char" translate="yes">',
    '          <source>Customer</source>',
    '          <target state="translated">Kunde</target>',
    '          <note from="Xliff Generator">Table Customer - Property Caption</note>',
    '        </trans-unit>',
    '        <trans-unit id="Table 1 - Property 3">',
    '          <source>A &amp; B</source>',
    '          <note from="Developer">mentions Table 1 - Property 2 in its text</note>',
    '        </trans-unit>',
    '        <trans-unit id="Codeunit 9 &amp; Friends - NamedType 4">',
    '          <source>Ampersand</source>',
    '        </trans-unit>',
    '      </body>',
    '    </body>',
    '  </file>',
    '</xliff>',
].join('\n');

/** The line the unit starts on, as the document's own `positionAt` reads the offset. */
function lineOf(text: string, unitId: string): number | undefined {
    const offset = findUnitOffset(text, unitId);
    return offset === undefined ? undefined : new FakeTextDocument('/w/lines.xlf', text).positionAt(offset).line;
}

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
});

afterEach(() => {
    resetMocks();
});

describe('findUnitOffset', () => {
    it('finds a unit by its id, at its <trans-unit>', () => {
        expect(DOCUMENT.startsWith('<trans-unit id="Table 1 - Property 2"', findUnitOffset(DOCUMENT, 'Table 1 - Property 2'))).toBe(true);
        expect(lineOf(DOCUMENT, 'Table 1 - Property 2')).toBe(5);
        expect(lineOf(DOCUMENT, 'Table 1 - Property 3')).toBe(10);
    });

    it('escapes the id, so one containing & is found where the file wrote it', () => {
        // The file holds `Codeunit 9 &amp; Friends - NamedType 4`; the DTO holds the `&`.
        expect(lineOf(DOCUMENT, 'Codeunit 9 & Friends - NamedType 4')).toBe(14);
    });

    it('anchors to the element, so an id quoted inside a note does not win', () => {
        // "Table 1 - Property 2" also appears in the Developer note of the next unit.
        expect(lineOf(DOCUMENT, 'Table 1 - Property 2')).toBe(5);
    });

    it('is undefined for a unit the text does not carry', () => {
        expect(findUnitOffset(DOCUMENT, 'Table 9 - Property 9')).toBeUndefined();
    });

    it('does not match a prefix of a longer id', () => {
        expect(findUnitOffset(DOCUMENT, 'Table 1 - Property')).toBeUndefined();
    });

    it('treats regex characters in an id as literal text', () => {
        const text = '<trans-unit id="Table (1) - Property [2]">';
        expect(findUnitOffset(text, 'Table (1) - Property [2]')).toBe(0);
        expect(findUnitOffset(text, 'Table .1. - Property .2.')).toBeUndefined();
    });

    it('counts in characters, so a CRLF file leaves the line to positionAt', () => {
        expect(findUnitOffset('a\r\nb\r\n<trans-unit id="x">', 'x')).toBe(6);
    });
});

describe('revealAsText', () => {
    it('asks for the built-in editor rather than ours', async () => {
        await revealAsText(vscode.Uri.file('/w/App.de-DE.xlf'));

        expect(flushExecutedCommands()).toEqual([
            { command: 'vscode.openWith', args: [expect.objectContaining({ scheme: 'file', path: '/w/App.de-DE.xlf' }), 'default'] },
        ]);
    });

    it('opens the file even when the editor cannot be found to scroll it', async () => {
        // The mock has no editors; the file still opens, which is most of the ask.
        await revealAsText(vscode.Uri.file('/w/App.de-DE.xlf'), 'Table 1 - Property 2');

        expect(flushExecutedCommands()).toHaveLength(1);
        expect(flushLogs().some(line => line.includes('could not find its editor'))).toBe(true);
    });
});

describe('revealInBaseFile', () => {
    const base = vscode.Uri.file('/w/App.g.xlf');

    it('opens the base file when it carries the unit', async () => {
        setVirtualFile('/w/App.g.xlf', DOCUMENT);

        expect(await revealInBaseFile(base, 'Table 1 - Property 2')).toBe(true);
        expect(flushExecutedCommands()).toHaveLength(1);
    });

    it('says no, and opens nothing, when the unit is not there', async () => {
        setVirtualFile('/w/App.g.xlf', DOCUMENT);

        expect(await revealInBaseFile(base, 'Table 9 - Property 9')).toBe(false);
        expect(flushExecutedCommands()).toHaveLength(0);
    });

    it('says no when the base file cannot be read at all', async () => {
        expect(await revealInBaseFile(base, 'Table 1 - Property 2')).toBe(false);
        expect(flushLogs().some(line => line.includes('Could not read the base file'))).toBe(true);
    });
});

import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AlNavigationOutcome, alTargetFor, findUnitLine, revealAlObject, revealAsText, revealInBaseFile } from '../../extension/services/navigation';
import { AlObjectIndex } from '../../extension/services/alObjectIndex';
import { Logger } from '../../extension/services/logger';
import { flushExecutedCommands, flushLogs, flushQuickPicks, flushRevealedPositions, resetMocks, setQuickPickResult, setVirtualFile } from '../__mocks__/vscode';

import type { AlNodeDto } from '../../shared/dto';

/**
 * §10.2 and §10.3. There are no offsets in the model (`DEC-017`), so a unit's line is
 * found by searching the text — which makes *what* is searched for the whole story.
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

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
});

afterEach(() => {
    resetMocks();
});

describe('findUnitLine', () => {
    it('finds a unit by its id', () => {
        expect(findUnitLine(DOCUMENT, 'Table 1 - Property 2')).toBe(5);
        expect(findUnitLine(DOCUMENT, 'Table 1 - Property 3')).toBe(10);
    });

    it('escapes the id, so one containing & is found where the file wrote it', () => {
        // The file holds `Codeunit 9 &amp; Friends - NamedType 4`; the DTO holds the `&`.
        expect(findUnitLine(DOCUMENT, 'Codeunit 9 & Friends - NamedType 4')).toBe(14);
    });

    it('anchors to the element, so an id quoted inside a note does not win', () => {
        // "Table 1 - Property 2" also appears in the Developer note of the next unit.
        expect(findUnitLine(DOCUMENT, 'Table 1 - Property 2')).toBe(5);
    });

    it('is undefined for a unit the text does not carry', () => {
        expect(findUnitLine(DOCUMENT, 'Table 9 - Property 9')).toBeUndefined();
    });

    it('does not match a prefix of a longer id', () => {
        expect(findUnitLine(DOCUMENT, 'Table 1 - Property')).toBeUndefined();
    });

    it('treats regex characters in an id as literal text', () => {
        const text = '<trans-unit id="Table (1) - Property [2]">';
        expect(findUnitLine(text, 'Table (1) - Property [2]')).toBe(0);
        expect(findUnitLine(text, 'Table .1. - Property .2.')).toBeUndefined();
    });

    it('counts lines from zero, whatever the line endings are', () => {
        expect(findUnitLine('a\r\nb\r\n<trans-unit id="x">', 'x')).toBe(2);
    });
});

describe('revealAsText', () => {
    it('asks for the built-in editor rather than ours (§10.3)', async () => {
        await revealAsText(vscode.Uri.file('/w/App.de-DE.xlf'));

        expect(flushExecutedCommands()).toEqual([
            { command: 'vscode.openWith', args: [vscode.Uri.file('/w/App.de-DE.xlf'), 'default'] },
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

describe('alTargetFor (§10.1)', () => {
    const tree: AlNodeDto[] = [{
        key: 'Table 3783554337',
        type: 'Table',
        name: 'PTE Contoso Methods Setup',
        children: [{
            key: 'Table 3783554337 - Field 4264183382',
            type: 'Field',
            name: 'Contoso Method',
            children: [{ key: 'Table 3783554337 - Field 4264183382 - Property 2879900210', type: 'Property', name: 'Caption', children: [] }],
        }],
    }];

    it('takes the object from the root segment', () => {
        expect(alTargetFor('Table 3783554337 - Field 4264183382 - Property 2879900210', tree))
            .toEqual({ kind: 'Table', name: 'PTE Contoso Methods Setup', memberName: 'Contoso Method' });
    });

    it('names no member for an object-level property — the property is not a member to reveal', () => {
        const shallow: AlNodeDto[] = [{
            key: 'Table 1',
            type: 'Table',
            name: 'Customer',
            children: [{ key: 'Table 1 - Property 2', type: 'Property', name: 'Caption', children: [] }],
        }];

        expect(alTargetFor('Table 1 - Property 2', shallow)).toEqual({ kind: 'Table', name: 'Customer' });
    });

    it('gives up when the generator note never yielded a name to search for', () => {
        expect(alTargetFor('Table 1', [{ key: 'Table 1', type: 'Table', children: [] }])).toBeUndefined();
    });

    it('gives up on an id that is not in this tree', () => {
        expect(alTargetFor('Table 9 - Property 1', tree)).toBeUndefined();
    });
});

describe('revealAlObject', () => {
    const TABLE = [
        'table 50100 "PTE Contoso Methods Setup"',
        '{',
        '    fields',
        '    {',
        '        field(1; "Contoso Method"; Code[20])',
        '        {',
        '        }',
        '    }',
        '}',
    ].join('\n');

    let index: AlObjectIndex;

    beforeEach(() => {
        index = new AlObjectIndex();
    });

    afterEach(() => {
        index.dispose();
    });

    it('opens the declaring file at the declaration line', async () => {
        setVirtualFile('/w/src/Table.al', TABLE);

        const outcome = await revealAlObject(index, { kind: 'Table', name: 'PTE Contoso Methods Setup' });

        expect(outcome).toBe(AlNavigationOutcome.opened);
        expect(flushRevealedPositions()).toEqual([{ path: '/w/src/Table.al', line: 0 }]);
    });

    it('reveals the member, not just the object, when the id names one', async () => {
        setVirtualFile('/w/src/Table.al', TABLE);

        await revealAlObject(index, { kind: 'Table', name: 'PTE Contoso Methods Setup', memberName: 'Contoso Method' });

        expect(flushRevealedPositions()).toEqual([{ path: '/w/src/Table.al', line: 4 }]);
    });

    it('falls back to the object line when the member cannot be found in the file', async () => {
        setVirtualFile('/w/src/Table.al', TABLE);

        await revealAlObject(index, { kind: 'Table', name: 'PTE Contoso Methods Setup', memberName: 'Absent' });

        expect(flushRevealedPositions()).toEqual([{ path: '/w/src/Table.al', line: 0 }]);
    });

    it('asks which one when two objects share a name, rather than choosing', async () => {
        setVirtualFile('/w/app-a/Table.al', 'table 50100 "Shared"\n{\n}');
        setVirtualFile('/w/app-b/Table.al', '\ntable 60100 "Shared"\n{\n}');
        setQuickPickResult(1);

        const outcome = await revealAlObject(index, { kind: 'Table', name: 'Shared' });

        expect(outcome).toBe(AlNavigationOutcome.opened);
        const [items] = flushQuickPicks();
        expect(items).toHaveLength(2);
        expect(items[0].label).toBe('table Shared');
        expect(items[0].description).toContain(':1');
        expect(flushRevealedPositions()).toEqual([{ path: '/w/app-b/Table.al', line: 1 }]);
    });

    it('opens nothing when the reader dismisses that choice', async () => {
        setVirtualFile('/w/app-a/Table.al', 'table 50100 "Shared"\n{\n}');
        setVirtualFile('/w/app-b/Table.al', 'table 60100 "Shared"\n{\n}');
        setQuickPickResult(undefined);

        expect(await revealAlObject(index, { kind: 'Table', name: 'Shared' })).toBe(AlNavigationOutcome.cancelled);
        expect(flushRevealedPositions()).toEqual([]);
    });

    it('tells a missing object apart from a workspace with no AL source at all', async () => {
        setVirtualFile('/w/src/Other.al', 'table 50100 "Other"\n{\n}');

        expect(await revealAlObject(index, { kind: 'Table', name: 'Absent' })).toBe(AlNavigationOutcome.notFound);
    });

    it('says there is no AL source when the workspace holds none', async () => {
        setVirtualFile('/w/App.de-DE.xlf', '<xliff/>');

        expect(await revealAlObject(index, { kind: 'Table', name: 'Absent' })).toBe(AlNavigationOutcome.noAlFiles);
        expect(flushRevealedPositions()).toEqual([]);
    });
});

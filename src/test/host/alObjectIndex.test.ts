import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AlObjectIndex, findMemberLine } from '../../extension/services/alObjectIndex';
import { Logger } from '../../extension/services/logger';
import { fireFileWatcher, flushFileReads, flushProgressTitles, resetMocks, setVirtualFile } from '../__mocks__/vscode';

import type * as vscode from 'vscode';

/**
 * §10.1. A targeted text search over `**\/*.al`, never an AL parser (§17) — so what the
 * declaration regex does and does not match is the whole of the contract.
 */

const CUSTOMER_TABLE = [
    'table 50100 "PTE Contoso Methods Setup"',
    '{',
    '    fields',
    '    {',
    '        field(1; "Contoso Method"; Code[20])',
    '        {',
    '            Caption = \'Contoso Method\';',
    '        }',
    '    }',
    '',
    '    procedure Recalculate()',
    '    begin',
    '    end;',
    '}',
].join('\n');

let index: AlObjectIndex;

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
    index = new AlObjectIndex();
});

afterEach(() => {
    index.dispose();
    resetMocks();
});

describe('finding a declaration', () => {
    it('finds a quoted object name at the line it is declared on', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);

        const found = await index.find('Table', 'PTE Contoso Methods Setup');

        expect(found).toHaveLength(1);
        expect(found[0].line).toBe(0);
        expect(found[0].uri.path).toBe('/w/src/Table.al');
    });

    it('finds a bare name, which AL allows when it has no spaces', async () => {
        setVirtualFile('/w/src/Codeunit.al', 'codeunit 50110 SalesHelper\n{\n}');

        expect(await index.find('Codeunit', 'SalesHelper')).toHaveLength(1);
    });

    it('finds a declaration with no object id, as extensions and interfaces are written', async () => {
        setVirtualFile('/w/src/Interface.al', 'interface "IPricing"\n{\n}');

        expect(await index.find('Interface', 'IPricing')).toHaveLength(1);
    });

    it('does not let a shorter kind swallow a longer one', async () => {
        // `report` is listed before `reportextension`; the alternation must still match
        // the whole keyword rather than stopping at the prefix.
        setVirtualFile('/w/src/Ext.al', 'reportextension 50100 "Sales Ext" extends "Standard Sales - Quote"\n{\n}');

        expect(await index.find('ReportExtension', 'Sales Ext')).toHaveLength(1);
        expect(await index.find('Report', 'Sales Ext')).toEqual([]);
    });

    it('finds an extension declared with a bare name and an extends clause', async () => {
        setVirtualFile('/w/src/Page.al', 'pageextension 50101 CustCardExt extends "Customer Card"\n{\n}');

        expect(await index.find('PageExtension', 'CustCardExt')).toHaveLength(1);
    });

    it('is case-insensitive on the kind and the name, because AL is', async () => {
        setVirtualFile('/w/src/Page.al', 'PAGE 50120 "Sales Cue"\n{\n}');

        expect(await index.find('page', 'sales cue')).toHaveLength(1);
    });

    it('matches the name exactly — a near miss opens nothing (§10.1)', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);

        expect(await index.find('Table', 'PTE Contoso Methods')).toEqual([]);
        expect(await index.find('Table', 'PTE Contoso Methods Setup Extra')).toEqual([]);
    });

    it('keys on the kind as well, so a Table and a Page of one name stay apart', async () => {
        // §4.2: the id hash is of the *name*, so `Table PTE Contoso Zone` and `Page PTE Contoso Zone` collide.
        setVirtualFile('/w/src/Both.al', 'table 50100 "PTE Contoso Zone"\n{\n}\n\npage 50100 "PTE Contoso Zone"\n{\n}');

        expect(await index.find('Table', 'PTE Contoso Zone')).toHaveLength(1);
        expect((await index.find('Page', 'PTE Contoso Zone'))[0].line).toBe(4);
    });

    it('ignores a mention that is not a declaration', async () => {
        setVirtualFile('/w/src/Uses.al', [
            'codeunit 50110 Consumer',
            '{',
            '    var',
            '        Setup: Record "PTE Contoso Methods Setup";',
            '',
            '    procedure Table50100()',
            '    begin',
            '    end;',
            '}',
        ].join('\n'));

        expect(await index.find('Table', 'PTE Contoso Methods Setup')).toEqual([]);
    });

    it('returns every declaration of a name, so the caller can ask which', async () => {
        setVirtualFile('/w/app-a/Table.al', 'table 50100 "Shared Name"\n{\n}');
        setVirtualFile('/w/app-b/Table.al', 'table 60100 "Shared Name"\n{\n}');

        expect(await index.find('Table', 'Shared Name')).toHaveLength(2);
    });

    it('reads no AL file at all when the workspace has none, and finds nothing', async () => {
        setVirtualFile('/w/App.de-DE.xlf', '<xliff/>');

        expect(await index.find('Table', 'Anything')).toEqual([]);
        expect(await index.hasAlFiles()).toBe(false);
    });

    it('says the workspace has AL source when it does', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);

        expect(await index.hasAlFiles()).toBe(true);
    });

    it('skips a file that declares nothing rather than losing the whole index', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);
        setVirtualFile('/w/src/Empty.al', '');

        expect(await index.find('Table', 'PTE Contoso Methods Setup')).toHaveLength(1);
    });
});

describe('building it once', () => {
    it('says what it is doing while it walks the workspace', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);

        await index.find('Table', 'PTE Contoso Methods Setup');
        expect(flushProgressTitles()).toEqual(['Indexing AL objects…']);

        await index.find('Table', 'PTE Contoso Methods Setup');
        expect(flushProgressTitles()).toEqual([]);
    });

    it('reuses the index across calls', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);

        await index.find('Table', 'PTE Contoso Methods Setup');
        expect(flushFileReads()).toEqual(['/w/src/Table.al']);

        await index.find('Codeunit', 'Something Else');
        expect(flushFileReads()).toEqual([]);
    });

    it('rebuilds after an AL file changes on disk', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);
        await index.find('Table', 'PTE Contoso Methods Setup');
        flushFileReads();

        setVirtualFile('/w/src/Table.al', 'table 50100 "Renamed"\n{\n}');
        fireFileWatcher('changed', '/w/src/Table.al');

        expect(await index.find('Table', 'Renamed')).toHaveLength(1);
        expect(flushFileReads()).toEqual(['/w/src/Table.al']);
    });

    it('rebuilds when an AL file is created, so a new object becomes reachable', async () => {
        setVirtualFile('/w/App.de-DE.xlf', '<xliff/>');
        expect(await index.find('Table', 'Later')).toEqual([]);

        setVirtualFile('/w/src/Later.al', 'table 50100 "Later"\n{\n}');
        fireFileWatcher('created', '/w/src/Later.al');

        expect(await index.find('Table', 'Later')).toHaveLength(1);
    });

    it('stops watching once disposed', async () => {
        setVirtualFile('/w/src/Table.al', CUSTOMER_TABLE);
        await index.find('Table', 'PTE Contoso Methods Setup');
        flushFileReads();

        index.dispose();
        fireFileWatcher('changed', '/w/src/Table.al');

        // Nothing to assert on but the absence of a rebuild: the watcher is gone.
        await index.find('Table', 'PTE Contoso Methods Setup');
        expect(flushFileReads()).toEqual(['/w/src/Table.al']);
    });
});

describe('findMemberLine', () => {
    it('lands on the line that declares the member, not on a later use of the name', () => {
        expect(findMemberLine(CUSTOMER_TABLE, 'Contoso Method')).toBe(4);
    });

    it('finds an unquoted member', () => {
        expect(findMemberLine(CUSTOMER_TABLE, 'Recalculate')).toBe(10);
    });

    it('does not match a name that merely contains the one asked for', () => {
        expect(findMemberLine('    field(1; "Contoso Methods"; Code[20])', 'Contoso Method')).toBeUndefined();
    });

    it('falls back to any line carrying the name when nothing declares it', () => {
        expect(findMemberLine('begin\n    Rec.Recalculate();\nend;', 'Recalculate')).toBe(1);
    });

    it('is undefined when the name is not in the file at all', () => {
        expect(findMemberLine(CUSTOMER_TABLE, 'Absent')).toBeUndefined();
    });

    it('treats regex characters in a member name as literal text', () => {
        expect(findMemberLine('    field(1; "Amount (LCY)"; Decimal)', 'Amount (LCY)')).toBe(0);
    });
});

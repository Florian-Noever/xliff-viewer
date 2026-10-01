import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { indexedObjects } from '../../extension/al/alHeaderIndex';
import { outlineAl } from '../../extension/al/alOutline';
import { unitTarget } from '../../extension/al/alTarget';
import { candidateObjects, locateUnit, LocatePrecision } from '../../extension/al/unitLocator';
import { alNameHash } from '../../extension/xliff/alNameHash';
import { generatorNote } from '../../extension/xliff/names';
import { parseXliff } from '../../extension/xliff/parser';
import { iterateUnits } from '../../shared/model';
import { renderApp } from '../fixtures/alRender';
import { CONTOSO_MANIFEST, contosoApp, fabrikamApp, NORTHWIND_MANIFEST } from '../fixtures/corpus';
import { CODEUNIT, PAGE, REPORT, TABLE } from '../fixtures/alSnippets';
import { NORTHWIND } from '../fixtures/northwind';

import type { AlOutline } from '../../extension/al/alOutline';
import type { LocateResult } from '../../extension/al/unitLocator';
import type { AlApp } from '../fixtures/alApp';
import type { AppManifest } from '../fixtures/alRender';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const h = alNameHash;

/** Locates one unit among the given files, the way the host does once it has read them. */
function locate(files: Readonly<Record<string, string>>, id: string, note?: string, objectTarget?: string, symbols: readonly string[] = []): LocateResult {
    const outlines = new Map<string, AlOutline>(Object.entries(files).map(([file, text]) => [file, outlineAl(text, symbols)]));
    const index = [...outlines].flatMap(([file, outline]) => indexedObjects(file, outline));
    const target = unitTarget(id, note, objectTarget);
    if (target === undefined) {
        throw new Error(`${id} carries no AL structure.`);
    }
    return locateUnit(target, candidateObjects(target, index), outlines);
}

/** The text at the location found, or the result's kind when nothing single was found. */
function textAt(files: Readonly<Record<string, string>>, result: LocateResult): string {
    return result.kind === 'found' ? files[result.location.file].slice(result.location.range.start, result.location.range.end) : result.kind;
}

describe.each([
    ['Contoso App', contosoApp(), CONTOSO_MANIFEST, 'Contoso App.g.xlf'],
    ['Northwind App', NORTHWIND, NORTHWIND_MANIFEST, 'Northwind App.g.xlf'],
    ['Fabrikam Base', fabrikamApp(), CONTOSO_MANIFEST, 'Fabrikam Base.de-DE.xlf'],
] as const satisfies readonly (readonly [string, AlApp, AppManifest, string])[])('every unit of %s', (_, app, manifest, file) => {
    it('is found where its source declares it, at the precision the source allows', () => {
        const source = renderApp(app, manifest);
        const outlines = new Map<string, AlOutline>(source.files.filter(each => each.path.endsWith('.al'))
            .map(each => [each.path, outlineAl(each.text, source.symbols)]));
        const index = [...outlines].flatMap(([path, outline]) => indexedObjects(path, outline));
        const units = [...iterateUnits(parseXliff(readFileSync(`${FIXTURES}/${file}`, 'utf8')))];

        expect(units.length).toBe(source.expected.size);
        for (const unit of units) {
            const target = unitTarget(unit.id, generatorNote(unit), unit.alObjectTarget);
            const expected = source.expected.get(unit.id);
            const result = target === undefined ? undefined : locateUnit(target, candidateObjects(target, index), outlines);

            expect(result?.kind, unit.id).toBe('found');
            if (result?.kind === 'found') {
                expect([result.location.file, result.location.range.start, result.location.precision], unit.id)
                    .toEqual([expected?.file, expected?.offset, expected?.precision]);
            }
        }
    });
});

describe('unitTarget', () => {
    it('reads the root, the path and the names the note gives', () => {
        const target = unitTarget(`Table ${h('Contoso Order')} - Field ${h('No.')} - Property ${h('Caption')}`, 'Table Contoso Order - Field No. - Property Caption');

        expect(target?.root).toEqual({ type: 'Table', hash: h('Contoso Order'), name: 'Contoso Order' });
        expect(target?.path.map(segment => segment.name)).toEqual(['No.', 'Caption']);
        expect(target?.declaring).toEqual({ type: 'Table', name: 'Contoso Order' });
    });

    it('keeps the declaring object apart from a folded root, whose name it does not give', () => {
        const target = unitTarget(`Table ${h('Contoso Setup')} - Field ${h('Region')} - Property ${h('Caption')}`, 'TableExtension Contoso Setup Ext. - Field Region - Property Caption');

        expect(target?.declaring).toEqual({ type: 'TableExtension', name: 'Contoso Setup Ext.' });
        expect(target?.root.name).toBeUndefined();
        expect(target?.path.map(segment => segment.name)).toEqual(['Region', 'Caption']);
    });

    it('reads a namespaced readable id, and its note\'s namespace', () => {
        const target = unitTarget('Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption', 'Namespace Contoso.Sales - Report Sales - Quote - Property Caption');

        expect(target?.namespace).toEqual({ type: 'Namespace', hash: h('Contoso.Sales'), name: 'Contoso.Sales' });
        expect(target?.root.name).toBe('Sales - Quote');
        expect(target?.declaring).toEqual({ type: 'Report', name: 'Sales - Quote', namespace: 'Contoso.Sales' });
        expect(target?.readable).toBe(true);
    });

    it('takes an API procedure\'s name from the note, not its all-digit method id', () => {
        const target = unitTarget('Page "Contoso API" - Method "7001"', 'Page Contoso API - Method ReleaseOrder');

        expect(target?.path[0]).toEqual({ type: 'Method', hash: h('7001'), name: 'ReleaseOrder' });
    });

    it('reads al-object-target, and nothing from an id without AL structure', () => {
        expect(unitTarget('Page 1 - Property 2', undefined, 'Page 12345')?.objectTarget).toEqual({ type: 'Page', hash: '12345' });
        expect(unitTarget('1')).toBeUndefined();
    });
});

describe('locateUnit', () => {
    const table = { 'Order.Table.al': TABLE };

    it('finds a property by its canonical name, whatever case the source writes it in', () => {
        const id = `Table ${h('Contoso Order')} - Field ${h('No.')} - Property ${h('ToolTip')}`;

        expect(textAt(table, locate(table, id))).toBe('tooltip');
    });

    it('finds a label in a trigger inside a field', () => {
        const id = `Table ${h('Contoso Order')} - Field ${h('Order Date')} - Method ${h('OnValidate')} - NamedType ${h('FutureDateErr')}`;

        expect(textAt(table, locate(table, id))).toBe('FutureDateErr');
    });

    it('finds a trigger written in another case by the name the note gives', () => {
        const files = { 'A.al': 'table 1 A { fields { field(1; B; Code[10]) { trigger onvalidate() var L: Label \'x\'; begin end; } } }' };
        const id = `Table ${h('A')} - Field ${h('B')} - Method ${h('OnValidate')} - NamedType ${h('L')}`;

        expect(textAt(files, locate(files, id, 'Table A - Field B - Method OnValidate - NamedType L'))).toBe('L');
    });

    it('finds a multilanguage property as the caption it replaces', () => {
        const files = { 'A.al': 'table 1 A { CaptionML = ENU = \'A\'; }' };

        expect(textAt(files, locate(files, `Table ${h('A')} - Property ${h('Caption')}`))).toBe('CaptionML');
    });

    it('tells a page control from an action of the same name', () => {
        const page = { 'Card.Page.al': PAGE };
        const control = locate(page, `Page ${h('Contoso Order Card')} - Control ${h('No.')} - Property ${h('ToolTip')}`);
        const action = locate(page, `Page ${h('Contoso Order Card')} - Action ${h('ReleaseOrder')} - Method ${h('OnAction')} - NamedType ${h('ReleasedMsg')}`);

        expect(textAt(page, control)).toBe('ToolTip');
        expect(textAt(page, action)).toBe('ReleasedMsg');
    });

    it('finds a report\'s label, a column\'s caption and a request page control', () => {
        const report = { 'Quote.Report.al': REPORT };
        const root = `Report ${h('Contoso Sales - Quote')}`;

        expect(textAt(report, locate(report, `${root} - ReportLabel ${h('PageLbl')}`))).toBe('PageLbl');
        expect(textAt(report, locate(report, `${root} - ReportColumn ${h('Amount')} - Property ${h('Caption')}`))).toBe('Caption');
        expect(textAt(report, locate(report, `${root} - Control ${h('ShowDetails')} - Property ${h('Caption')}`))).toBe('Caption');
    });

    it('finds a request page trigger\'s label, with and without the request page in the id', () => {
        const report = { 'Quote.Report.al': REPORT };
        const root = `Report ${h('Contoso Sales - Quote')}`;

        expect(textAt(report, locate(report, `${root} - RequestPage ${h('Anything')} - Method ${h('OnOpenPage')} - NamedType ${h('OpenedMsg')}`))).toBe('OpenedMsg');
        expect(textAt(report, locate(report, `${root} - Method ${h('OnOpenPage')} - NamedType ${h('OpenedMsg')}`))).toBe('OpenedMsg');
    });

    it('finds an API procedure by the name the note gives', () => {
        const files = { 'Api.al': 'page 1 "Contoso API" { [ServiceEnabled] procedure ReleaseOrder() begin end; }' };

        expect(textAt(files, locate(files, 'Page "Contoso API" - Method "7001"', 'Page Contoso API - Method ReleaseOrder'))).toBe('ReleaseOrder');
    });

    it('tries every overload until one declares the label', () => {
        const files = { 'Mgt.al': 'codeunit 1 Mgt { procedure Run(A: Integer) begin end; procedure Run() var DoneMsg: Label \'Done\'; begin end; }' };
        const result = locate(files, `Codeunit ${h('Mgt')} - Method ${h('Run')} - NamedType ${h('DoneMsg')}`);

        expect(textAt(files, result)).toBe('DoneMsg');
        expect(result.kind === 'found' ? result.location.precision : undefined).toBe(LocatePrecision.exact);
    });

    it('settles on the member when the source has no line for the element', () => {
        const files = { 'A.al': 'table 1 A { fields { field(1; B; Code[10]) { } } }' };
        const result = locate(files, `Table ${h('A')} - Field ${h('B')} - Property ${h('Caption')}`);

        expect(textAt(files, result)).toBe('B');
        expect(result.kind === 'found' ? result.location.precision : undefined).toBe(LocatePrecision.member);
    });

    it('settles on the object when not even the member is there', () => {
        const files = { 'A.al': 'table 1 A { }' };
        const result = locate(files, `Table ${h('A')} - Field ${h('Gone')} - Property ${h('Caption')}`);

        expect(textAt(files, result)).toBe('A');
        expect(result.kind === 'found' ? result.location.precision : undefined).toBe(LocatePrecision.object);
    });

    it('finds nothing for an object the files do not declare', () => {
        expect(locate(table, `Table ${h('Missing')} - Property ${h('Caption')}`).kind).toBe('notFound');
    });

    it('asks rather than guesses when two files declare the same element', () => {
        const files = { 'One.al': 'table 1 A { Caption = \'A\'; }', 'Two.al': 'table 1 A { Caption = \'A\'; }' };
        const result = locate(files, `Table ${h('A')} - Property ${h('Caption')}`);

        expect(result.kind).toBe('ambiguous');
        expect(result.kind === 'ambiguous' ? result.locations.map(location => location.file).sort() : []).toEqual(['One.al', 'Two.al']);
    });
});

describe('candidate tiers', () => {
    const setup = 'table 1 "Contoso Setup" { fields { field(1; Code; Code[10]) { } } }';
    const extension = 'tableextension 2 "Contoso Setup Ext." extends "Contoso Setup" { fields { field(10; Region; Code[10]) { Caption = \'Region\'; } } }';
    const folded = `Table ${h('Contoso Setup')} - Field ${h('Region')} - Property ${h('Caption')}`;
    const files = { 'Setup.al': setup, 'SetupExt.al': extension };

    it('finds an element filed under the object its extension extends, through the note', () => {
        const result = locate(files, folded, 'TableExtension Contoso Setup Ext. - Field Region - Property Caption');

        expect(textAt(files, result)).toBe('Caption');
        expect(result.kind === 'found' ? result.location.tier : undefined).toBe(1);
    });

    it('finds it without the note, through al-object-target naming the extended object', () => {
        const result = locate(files, folded, undefined, `Table ${h('Contoso Setup')}`);

        expect(textAt(files, result)).toBe('Caption');
        expect(result.kind === 'found' ? result.location.tier : undefined).toBe(3);
    });

    it('finds an element filed under a sibling extension of the same object, without the note', () => {
        const siblings = {
            'First.al': 'pageextension 10 "Contoso First" extends "Customer List" { layout { addlast(Content) { field(A; Rec.A) { } } } }',
            'Second.al': 'pageextension 11 "Contoso Second" extends "Customer List" { layout { addlast(Content) { field(B; Rec.B) { Caption = \'B\'; } } } }',
        };
        const result = locate(siblings, `PageExtension ${h('Contoso First')} - Control ${h('B')} - Property ${h('Caption')}`);

        expect(textAt(siblings, result)).toBe('Caption');
        expect(result.kind === 'found' ? [result.location.file, result.location.tier] : undefined).toEqual(['Second.al', 4]);
    });

    it('keeps two objects of one name apart by the id\'s namespace', () => {
        const namespaces = {
            'Sales.al': 'namespace Contoso.Sales; table 1 Order { Caption = \'Sales\'; }',
            'Purchasing.al': 'namespace Contoso.Purchasing; table 2 Order { Caption = \'Purchasing\'; }',
        };
        const result = locate(namespaces, 'Namespace Contoso.Purchasing - Table Order - Property Caption');

        expect(result.kind === 'found' ? result.location.file : result.kind).toBe('Purchasing.al');
    });

    it('prefers the object without a namespace for a readable id without one', () => {
        const namespaces = {
            'Old.al': 'table 1 Order { Caption = \'Old\'; }',
            'Sales.al': 'namespace Contoso.Sales; table 2 Order { Caption = \'Sales\'; }',
        };

        expect(textAt(namespaces, locate(namespaces, 'Table Order - Property Caption'))).toBe('Caption');
        expect((locate(namespaces, 'Table Order - Property Caption') as { readonly location?: { readonly file: string } }).location?.file).toBe('Old.al');
    });

    it('prefers the global object, for a readable id whose note names no namespace either', () => {
        // A namespaced app's note names every namespace, so one without names a global object.
        const namespaces = {
            'Old.al': 'table 1 Order { Caption = \'Old\'; }',
            'Sales.al': 'namespace Contoso.Sales; table 2 Order { Caption = \'Sales\'; }',
        };
        const result = locate(namespaces, 'Table Order - Property Caption', 'Table Order - Property Caption');

        expect(result.kind === 'found' ? result.location.file : result.kind).toBe('Old.al');
    });

    it('opens the object the id names when the note\'s name holds a later anchor', () => {
        const reports = {
            'A.al': 'report 1 Sales { Caption = \'Sales\'; }',
            'B.al': 'report 2 "Sales - Property List" { Caption = \'List\'; }',
        };
        const result = locate(reports, `Report ${h('Sales - Property List')} - Property ${h('Caption')}`, 'Report Sales - Property List - Property Caption');

        expect(result.kind === 'found' ? [result.location.file, result.location.tier] : result.kind).toEqual(['B.al', 1]);
    });

    it('finds a report extension\'s request page trigger, and selects the keyword for the request page', () => {
        const sources = {
            'Ext.al': 'reportextension 3 "Contoso Quote Ext." extends "Sales - Quote" { requestpage { trigger OnOpenPage() var OpenedLbl: Label \'Opened\'; begin end; } }',
        };
        const root = `ReportExtension ${h('Contoso Quote Ext.')} - RequestPageExtension ${h('Sales - Quote')}`;

        expect(textAt(sources, locate(sources, `${root} - Method ${h('OnOpenPage')} - NamedType ${h('OpenedLbl')}`))).toBe('OpenedLbl');
        expect(textAt(sources, locate(sources, `${root} - Method ${h('OnClosePage')} - NamedType ${h('ClosedLbl')}`))).toBe('requestpage');
    });

    it('finds an extension whose extends names its object in another case', () => {
        const sources = {
            'Setup.al': 'table 1 "Contoso Setup" { }',
            'Ext.al': 'tableextension 2 "Contoso Setup Ext." extends "contoso setup" { fields { field(10; Region; Code[10]) { Caption = \'Region\'; } } }',
        };
        const result = locate(sources, `Table ${h('Contoso Setup')} - Field ${h('Region')} - Property ${h('Caption')}`, undefined, `Table ${h('Contoso Setup')}`);

        expect(textAt(sources, result)).toBe('Caption');
        expect(result.kind === 'found' ? result.location.tier : undefined).toBe(3);
    });

    it('tries the overload whose name hashes to the id before one that matches only in another case', () => {
        const sources = {
            'Mgt.al': 'codeunit 4 Mgt { procedure Foo() var DoneMsg: Label \'Big\'; begin end; procedure foo(A: Integer) var DoneMsg: Label \'Small\'; begin end; }',
        };
        const result = locate(sources, `Codeunit ${h('Mgt')} - Method ${h('foo')} - NamedType ${h('DoneMsg')}`, 'Codeunit Mgt - Method foo - NamedType DoneMsg');

        expect(result.kind === 'found' ? sources['Mgt.al'].indexOf('Small') > result.location.range.start && result.location.range.start > sources['Mgt.al'].indexOf('foo(') : result.kind).toBe(true);
    });

    it('finds a view added with no anchor', () => {
        const sources = {
            'Views.al': 'pageextension 5 "Contoso Views" extends "Customer List" { views { addfirst { view(OpenOnes) { Caption = \'Open\'; } } } }',
        };

        expect(textAt(sources, locate(sources, `PageExtension ${h('Contoso Views')} - View ${h('OpenOnes')} - Property ${h('Caption')}`))).toBe('Caption');
    });

    it('finds nothing, and throws nothing, for a segment type that names something every object has', () => {
        // A member to test the type against is what reaches the kind table.
        const sources = { 'Order.al': 'table 1 Order { Caption = \'Order\'; fields { field(1; Code; Code[10]) { } } }' };

        for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
            expect(() => locate(sources, `Table ${h('Order')} - ${type} ${h('X')} - Property ${h('Caption')}`), type).not.toThrow();
        }
    });

    it('reads a codeunit\'s labels past attributes and protected variables', () => {
        const codeunit = { 'Mgt.al': CODEUNIT };
        const root = `Codeunit ${h('Contoso Mgt.')}`;

        expect(textAt(codeunit, locate(codeunit, `${root} - Method ${h('OnAfterInsertCustomer')} - NamedType ${h('InsertedMsg')}`))).toBe('InsertedMsg');
        expect(textAt(codeunit, locate(codeunit, `${root} - NamedType ${h('StartedMsg')}`))).toBe('StartedMsg');
    });
});

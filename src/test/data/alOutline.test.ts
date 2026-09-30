import { describe, expect, it } from 'vitest';

import { outlineAl, scanHeaders } from '../../extension/al/alOutline';
import { canonicalPropertyName, declaresMember, isTransparent } from '../../extension/al/alSymbolKinds';
import {
    API_PAGE, CODEUNIT, CUSTOMIZATION, DIRECTIVES, DOTNET_AND_ADDIN, EDGES, ENUM, INTERFACE, PAGE, PAGE_EXTENSION,
    PROFILE_AND_PERMISSIONS, QUERY, REPORT, SNIPPETS, TABLE, TWO_OBJECTS, XMLPORT,
} from '../fixtures/alSnippets';

import type { AlDeclaration, AlRange } from '../../extension/al/alOutline';

function* walk(declarations: readonly AlDeclaration[]): Generator<AlDeclaration> {
    for (const declaration of declarations) {
        yield declaration;
        yield* walk(declaration.children);
    }
}

const all = (text: string, symbols: readonly string[] = []) => [...walk(outlineAl(text, symbols).objects)];
const named = (text: string, keyword: string, name: string) => all(text).find(each => each.keyword === keyword && each.name?.text === name);
const slice = (text: string, range: AlRange | undefined) => (range === undefined ? undefined : text.slice(range.start, range.end));

describe('objects', () => {
    it('reads kind, number, name and namespace', () => {
        const [object] = outlineAl(TABLE).objects;

        expect(object.keyword).toBe('table');
        expect(object.id).toBe(50100);
        expect(object.name?.text).toBe('Contoso Order');
        expect(slice(TABLE, object.name?.range)).toBe('"Contoso Order"');
        expect(object.namespace).toBe('Contoso.Sales');
        expect(outlineAl(TABLE).namespace?.text).toBe('Contoso.Sales');
    });

    it('reads an extension\'s target without its namespace', () => {
        const [object] = outlineAl(PAGE_EXTENSION).objects;

        expect(object.target?.text).toBe('Customer Card');
        expect(outlineAl(CUSTOMIZATION).objects[0].target?.text).toBe('Customer Card');
    });

    it('reads objects without a number, and several in one file', () => {
        expect(outlineAl(PROFILE_AND_PERMISSIONS).objects.map(object => [object.keyword, object.id, object.name?.text]))
            .toEqual([['profile', undefined, 'Contoso Clerk'], ['permissionset', 50108, 'Contoso Edit']]);
        expect(outlineAl(TWO_OBJECTS).objects.map(object => [object.keyword, object.name?.text])).toEqual([['table', 'Plain'], ['codeunit', 'Helper']]);
    });

    it('reads an object with implements, and one with no name at all', () => {
        expect(outlineAl(ENUM).objects[0].name?.text).toBe('Contoso Status');
        expect(outlineAl(DOTNET_AND_ADDIN).objects.map(object => [object.keyword, object.name?.text])).toEqual([['dotnet', undefined], ['controladdin', 'Contoso Map']]);
    });

    it('spans the object from its keyword to its closing brace', () => {
        const [object] = outlineAl(PAGE).objects;

        expect(PAGE.slice(object.range.start, object.range.end).startsWith('page 50101')).toBe(true);
        expect(PAGE.slice(object.range.start, object.range.end).endsWith('}')).toBe(true);
        expect(object.range.end).toBe(PAGE.trimEnd().length);
    });
});

describe('members and sections', () => {
    it('reads a table field by its name, in the fields section', () => {
        const field = named(TABLE, 'field', 'No.');

        expect(field?.section).toBe('fields');
        expect(slice(TABLE, field?.name?.range)).toBe('"No."');
        expect(field?.properties.map(property => property.name.text)).toEqual(['Caption', 'tooltip']);
    });

    it('reads a property from its name to its semicolon, a brace in its string and all', () => {
        const property = named(TABLE, 'field', 'No.')?.properties[1];

        expect(slice(TABLE, property?.range)).toBe('tooltip = \'Specifies the number. {Not a brace}\';');
        expect(slice(TABLE, property?.name.range)).toBe('tooltip');
    });

    it('skips a property value with nested brackets', () => {
        expect(named(TABLE, 'field', 'Order Date')?.properties.map(property => property.name.text)).toEqual(['Caption', 'TableRelation']);
    });

    it('reads nothing inside a comment', () => {
        expect(named(TABLE, 'field', 'Commented')).toBeUndefined();
        expect(named(TABLE, 'field', 'Block Commented')).toBeUndefined();
        expect(named(TABLE, 'field', 'Größe')?.section).toBe('fields');
    });

    it('reads keys and field groups in their sections', () => {
        expect(named(TABLE, 'key', 'PK')?.section).toBe('keys');
        expect(named(TABLE, 'fieldgroup', 'DropDown')?.properties.map(property => property.name.text)).toEqual(['Caption']);
    });

    it('reads page controls and actions, nested, with the section they sit in', () => {
        expect(named(PAGE, 'field', 'No.')?.section).toBe('layout');
        expect(named(PAGE, 'part', 'Lines')?.section).toBe('layout');
        expect(named(PAGE, 'group', 'General')?.section).toBe('layout');
        expect(named(PAGE, 'group', 'Release')?.section).toBe('actions');
        expect(named(PAGE, 'action', 'ReleaseOrder')?.section).toBe('actions');
        expect(named(PAGE, 'actionref', 'ReleaseOrder_Promoted')?.section).toBe('actions');
        expect(named(PAGE, 'view', 'OpenOrders')?.properties.map(property => property.name.text)).toEqual(['Caption']);
    });

    it('reads what an extension adds, changes and moves', () => {
        expect(named(PAGE_EXTENSION, 'addafter', 'Name')?.children.map(child => child.name?.text)).toEqual(['Contoso Orders']);
        expect(named(PAGE_EXTENSION, 'modify', 'Phone No.')?.properties.map(property => property.name.text)).toEqual(['Caption']);
        expect(named(PAGE_EXTENSION, 'moveafter', 'Name')).toBeDefined();
    });

    it('reads a report\'s data items, columns, request page, labels and layouts', () => {
        expect(named(REPORT, 'dataitem', 'Header')?.section).toBe('dataset');
        expect(named(REPORT, 'column', 'Amount')?.properties.map(property => property.name.text)).toEqual(['Caption']);
        expect(named(REPORT, 'field', 'ShowDetails')?.section).toBe('layout');
        expect(all(REPORT).find(each => each.keyword === 'labels')?.properties.map(property => property.name.text)).toEqual(['PageLbl', 'TotalLbl']);
        expect(named(REPORT, 'layout', 'QuoteLayout')?.section).toBe('rendering');
        expect(all(REPORT).find(each => each.keyword === 'requestpage')?.properties.map(property => property.name.text)).toEqual(['SaveValues']);
    });

    it('reads enum values, a blank name among them', () => {
        expect(all(ENUM).filter(each => each.keyword === 'value').map(each => each.name?.text)).toEqual([' ', 'Open']);
    });

    it('reads an xmlport\'s schema and a query\'s elements', () => {
        expect(all(XMLPORT).filter(each => each.kind === 'member' && each.section === 'schema').map(each => [each.keyword, each.name?.text]))
            .toEqual([['textelement', 'Root'], ['tableelement', 'Order'], ['fieldelement', 'No'], ['textattribute', 'Version']]);
        expect(all(QUERY).filter(each => each.kind === 'member' && each.section === 'elements').map(each => [each.keyword, each.name?.text]))
            .toEqual([['dataitem', 'Header'], ['column', 'No'], ['filter', 'OrderDate']]);
    });

    it('reads profile and permission set properties', () => {
        const [profile, permissions] = outlineAl(PROFILE_AND_PERMISSIONS).objects;

        expect(profile.properties.map(property => property.name.text)).toEqual(['Caption', 'ProfileDescription', 'RoleCenter']);
        expect(permissions.properties.map(property => property.name.text)).toEqual(['Assignable', 'Caption', 'Permissions']);
    });
});

describe('methods and variables', () => {
    it('reads a trigger inside a member, with its local labels', () => {
        const trigger = named(TABLE, 'field', 'Order Date')?.children.find(child => child.keyword === 'trigger');

        expect(trigger?.name?.text).toBe('OnValidate');
        expect(trigger?.variables.map(variable => [variable.name.text, variable.type])).toEqual([['FutureDateErr', 'label']]);
        expect(slice(TABLE, trigger?.variables[0].range)).toBe('FutureDateErr: Label \'The date %1 lies in the future.\', Comment = \'%1 = the date\';');
    });

    it('reads an action\'s trigger and a request page\'s trigger', () => {
        expect(named(PAGE, 'action', 'ReleaseOrder')?.children.map(child => child.name?.text)).toEqual(['OnAction']);
        expect(all(REPORT).find(each => each.keyword === 'requestpage')?.children.find(child => child.keyword === 'trigger')?.variables[0].name.text)
            .toBe('OpenedMsg');
    });

    it('reads procedures past attributes, modifiers, return values and case…end bodies', () => {
        const methods = outlineAl(CODEUNIT).objects[0].children.filter(child => child.kind === 'method');

        expect(methods.map(method => method.name?.text)).toEqual(['OnRun', 'OnAfterInsertCustomer', 'Run', 'Shout']);
        expect(methods[1].variables.map(variable => variable.name.text)).toEqual(['InsertedMsg']);
        expect(methods[2].variables.map(variable => [variable.name.text, variable.type])).toEqual([['Text001', 'textconst']]);
    });

    it('reads object-level variables, protected ones and lists of names included', () => {
        const [codeunit] = outlineAl(CODEUNIT).objects;

        expect(codeunit.variables.map(variable => [variable.name.text, variable.type])).toEqual([
            ['StartedMsg', 'label'], ['Counter', 'integer'], ['Total', 'integer'],
        ]);
        expect(outlineAl(TABLE).objects[0].variables.map(variable => variable.name.text)).toEqual(['GlobalLbl']);
    });

    it('reads procedures without a body, in an interface and a control add-in', () => {
        expect(outlineAl(INTERFACE).objects[0].children.map(child => child.name?.text)).toEqual(['Describe', 'IsFinal']);
        expect(outlineAl(DOTNET_AND_ADDIN).objects[1].children.map(child => [child.keyword, child.name?.text]))
            .toEqual([['event', 'MapReady'], ['procedure', 'Show']]);
    });

    it('reads an API procedure past its attributes', () => {
        const [page] = outlineAl(API_PAGE).objects;

        expect(page.children.map(child => child.name?.text)).toEqual(['ReleaseOrder']);
        expect(page.properties.map(property => property.name.text)).toEqual(['PageType', 'EntityCaption', 'EntitySetCaption']);
    });
});

describe('what a structural reading most easily gets wrong', () => {
    it('reads a method past a bracketed return type, its locals and body included', () => {
        const method = named(EDGES, 'procedure', 'GetCode');

        expect(method?.variables.map(variable => variable.name.text)).toEqual(['LocalLbl']);
        expect(slice(EDGES, method?.range)?.endsWith('end;')).toBe(true);
        // The body is code: nothing in it is a property or a member of the object.
        expect(outlineAl(EDGES).objects[0].properties).toEqual([]);
        expect(all(EDGES).some(each => each.keyword === 'exit' || each.keyword === 'message')).toBe(false);
    });

    it('reads a list return type, and attributes on variables, of the object and of a method', () => {
        const [codeunit] = outlineAl(EDGES).objects;

        expect(codeunit.variables.map(variable => variable.name.text)).toEqual(['IsVisible', 'AfterLbl']);
        expect(named(EDGES, 'procedure', 'GetList')?.variables.map(variable => variable.name.text)).toEqual(['Customer', 'ListLbl']);
    });

    it('reads a verbatim string as text, so what follows it is still found', () => {
        expect(named(EDGES, 'procedure', 'After')?.variables.map(variable => variable.name.text)).toEqual(['AfterMethodLbl']);
        expect(outlineAl(EDGES).objects.map(object => object.name?.text)).toEqual(['Contoso Edges', 'Contoso Views Ext.', 'Contoso Labels']);
    });

    it('keeps the section an add with no anchor sits in', () => {
        const view = named(EDGES, 'view', 'OpenOnes');

        expect(view?.section).toBe('views');
        expect(view !== undefined && declaresMember(view, 'View')).toBe(true);
    });

    it('reads a report label in its multilanguage form as a label', () => {
        const labels = all(EDGES).find(each => each.keyword === 'labels');

        expect(labels?.properties.map(property => property.name.text)).toEqual(['CompanyCaption', 'TotalLbl']);
        expect(slice(EDGES, labels?.properties[0].name.range)).toBe('CompanyCaption');
    });
});

describe('preprocessor directives', () => {
    it('reads the branch the symbols select, and only that one', () => {
        const clean = named(DIRECTIVES, 'field', 'Code');
        const legacy = all(DIRECTIVES).find(each => each.keyword === 'field' && each.name?.text === 'Code');
        const withoutSymbol = outlineAl(DIRECTIVES).objects[0];

        expect(clean).toBeDefined();
        expect(all(DIRECTIVES, ['CLEAN']).find(each => each.name?.text === 'Code')?.properties.map(property => property.name.text)).toEqual(['Caption']);
        expect(legacy?.properties.map(property => property.name.text)).toEqual(['ObsoleteState', 'Caption']);
        expect(withoutSymbol.children[0].children.map(child => child.name?.text)).toEqual(['Code', 'Kept']);
    });
});

describe('line endings', () => {
    it('reads the branch the symbols select in CRLF text too', () => {
        const text = DIRECTIVES.replace(/\n/g, '\r\n');

        expect(all(text, ['CLEAN']).find(each => each.name?.text === 'Code')?.properties.map(property => property.name.text)).toEqual(['Caption']);
        expect(outlineAl(text).objects[0].children[0].children.map(child => child.name?.text)).toEqual(['Code', 'Kept']);
    });

    it('gives exact offsets in CRLF text', () => {
        const text = PAGE.replace(/\n/g, '\r\n');
        const field = all(text).find(each => each.keyword === 'field' && each.name?.text === 'No.');

        expect(slice(text, field?.name?.range)).toBe('"No."');
        expect(slice(text, field?.properties[0].range)).toBe('ToolTip = \'Specifies the number.\';');
    });
});

describe('scanHeaders', () => {
    it.each(Object.entries(SNIPPETS))('reads the same objects as the full outline: %s', (_, text) => {
        const header = (object: { readonly keyword: string; readonly id?: number; readonly name?: { readonly text: string }; readonly namespace?: string; readonly target?: { readonly text: string } }) =>
            [object.keyword, object.id, object.name?.text, object.namespace, object.target?.text];

        expect(scanHeaders(text).objects.map(header)).toEqual(outlineAl(text).objects.map(header));
    });
});

describe('tolerance', () => {
    it.each(Object.entries(SNIPPETS))('outlines every truncation of %s without throwing', (_, text) => {
        for (let length = 0; length <= text.length; length++) {
            expect(() => outlineAl(text.slice(0, length)), `at ${length}`).not.toThrow();
        }
    });

    it('skips blocks nested past any real depth, rather than overflowing', () => {
        const text = `table 1 X ${'a {'.repeat(10000)}${'}'.repeat(10000)}`;

        expect(() => outlineAl(text)).not.toThrow();
        expect(outlineAl(text).objects.map(object => object.name?.text)).toEqual(['X']);
    });

    it('closes a block at the next brace when a member is cut short', () => {
        const text = 'table 1 X { fields { field(1; A; Code[10] { Caption = \'A\'; } } }';

        expect(named(text, 'field', 'A')?.properties.map(property => property.name.text)).toEqual(['Caption']);
    });
});

describe('the kind table', () => {
    it('knows a translatable property whatever its case, and its multilanguage form', () => {
        expect(canonicalPropertyName('tooltip')).toBe('ToolTip');
        expect(canonicalPropertyName('CaptionML')).toBe('Caption');
        expect(canonicalPropertyName('DataClassification')).toBeUndefined();
    });

    it('tells a table field from a page field by the section it sits in', () => {
        const tableField = named(TABLE, 'field', 'No.');
        const pageField = named(PAGE, 'field', 'No.');

        expect(tableField !== undefined && declaresMember(tableField, 'Field')).toBe(true);
        expect(tableField !== undefined && declaresMember(tableField, 'Control')).toBe(false);
        expect(pageField !== undefined && declaresMember(pageField, 'Control')).toBe(true);
    });

    it('tells a control group from an action group', () => {
        const control = named(PAGE, 'group', 'General');
        const action = named(PAGE, 'group', 'Release');

        expect(control !== undefined && declaresMember(control, 'Control')).toBe(true);
        expect(action !== undefined && declaresMember(action, 'Action')).toBe(true);
        expect(action !== undefined && declaresMember(action, 'Control')).toBe(false);
    });

    it('sees through what an extension adds after', () => {
        const added = named(PAGE_EXTENSION, 'addafter', 'Name');

        expect(added !== undefined && isTransparent(added)).toBe(true);
    });
});

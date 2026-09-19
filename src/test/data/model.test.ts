import { describe, expect, it } from 'vitest';

import { iterateUnits, type XliffDocument, type XliffGroup, type XliffTransUnit } from '../../shared/model';

function unit(id: string): XliffTransUnit {
    return { attributes: { id }, id, translate: true, source: id, notes: [] };
}

function group(id: string, units: XliffTransUnit[], groups: XliffGroup[] = []): XliffGroup {
    return { attributes: { id }, id, units, groups };
}

function document(files: XliffDocument['files']): XliffDocument {
    return {
        attributes: { version: '1.2' },
        version: '1.2',
        files,
        format: { hasBom: false, declaration: '<?xml version="1.0"?>', eol: '\n', hasTrailingNewline: false },
    };
}

describe('iterateUnits', () => {
    it('walks units in file order through nested groups', () => {
        const doc = document([{
            attributes: {},
            sourceLanguage: 'en-US',
            body: {
                attributes: {},
                units: [unit('body-1')],
                groups: [group('outer', [unit('outer-1')], [group('inner', [unit('inner-1')])])],
            },
        }]);

        expect([...iterateUnits(doc)].map(u => u.id)).toEqual(['body-1', 'outer-1', 'inner-1']);
    });

    it('walks every file, not just the first', () => {
        const doc = document([
            { attributes: {}, sourceLanguage: 'en-US', body: { attributes: {}, units: [unit('a')], groups: [] } },
            { attributes: {}, sourceLanguage: 'en-US', body: { attributes: {}, units: [unit('b')], groups: [] } },
        ]);

        expect([...iterateUnits(doc)].map(u => u.id)).toEqual(['a', 'b']);
    });

    it('yields nothing for an empty body', () => {
        const doc = document([{ attributes: {}, sourceLanguage: 'en-US', body: { attributes: {}, units: [], groups: [] } }]);
        expect([...iterateUnits(doc)]).toEqual([]);
    });
});

describe('the attributes bag', () => {
    it('can carry attributes the named fields do not model', () => {
        // AL puts these on <xliff>; without the bag they would be lost and the
        // byte-identical round-trip would fail on every AL-generated file.
        const doc = document([]);
        const withNamespaces: XliffDocument = {
            ...doc,
            attributes: {
                version: '1.2',
                xmlns: 'urn:oasis:names:tc:xliff:document:1.2',
                'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
                'xsi:schemaLocation': 'urn:oasis:names:tc:xliff:document:1.2 xliff-core-1.2-transitional.xsd',
            },
        };

        expect(Object.keys(withNamespaces.attributes)).toEqual([
            'version',
            'xmlns',
            'xmlns:xsi',
            'xsi:schemaLocation',
        ]);
    });
});

describe('DocumentFormat', () => {
    it('records the facts the serialiser must reproduce', () => {
        const format = document([]).format;
        expect(format).toEqual({
            hasBom: false,
            declaration: '<?xml version="1.0"?>',
            eol: '\n',
            hasTrailingNewline: false,
        });
    });
});

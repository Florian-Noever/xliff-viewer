import { describe, expect, it } from 'vitest';

import { iterateUnits, type XliffDocument } from '../../shared/model';
import { document, file, group, unit } from '../support/modelBuilders';

describe('iterateUnits', () => {
    it('walks units in file order through nested groups', () => {
        const doc = document([file([unit('body-1')], [group([unit('outer-1')], [group([unit('inner-1')])])])]);

        expect([...iterateUnits(doc)].map(u => u.id)).toEqual(['body-1', 'outer-1', 'inner-1']);
    });

    it('walks every file, not just the first', () => {
        const doc = document([file([unit('a')]), file([unit('b')])]);

        expect([...iterateUnits(doc)].map(u => u.id)).toEqual(['a', 'b']);
    });

    it('yields nothing for an empty body', () => {
        const doc = document([file([])]);
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

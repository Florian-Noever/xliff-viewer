import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { alNameHash } from '../../extension/xliff/alNameHash';
import { generatorNote, namesFromNote } from '../../extension/xliff/names';
import { parseXliff } from '../../extension/xliff/parser';
import { canonicalPath, canonicalSegment, parseUnitId } from '../../extension/xliff/unitId';
import { iterateUnits } from '../../shared/model';
import { lastSegmentLabel, splitUnitId } from '../../shared/unitPath';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const unitsOf = (name: string) => [...iterateUnits(parseXliff(readFileSync(`${FIXTURES}/${name}`, 'utf8')))];
const CORPUS = ['Contoso App.g.xlf', 'Fabrikam Base.de-DE.xlf'];

describe('splitUnitId', () => {
    it('splits a hashed id on the separator', () => {
        expect(splitUnitId('Table 3783554337 - Field 4264183382 - Property 2879900210'))
            .toEqual(['Table 3783554337', 'Field 4264183382', 'Property 2879900210']);
    });

    it('does not split inside a quoted name', () => {
        expect(splitUnitId('Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption'))
            .toEqual(['Namespace Contoso.Sales', 'Report "Sales - Quote"', 'Property Caption']);
    });

    it('reads a doubled quote inside a quoted name as part of the name', () => {
        expect(splitUnitId('Table "Say ""Hi"" - Now" - Property Caption'))
            .toEqual(['Table "Say ""Hi"" - Now"', 'Property Caption']);
    });

    it('keeps an id with no separator whole', () => {
        expect(splitUnitId('1')).toEqual(['1']);
    });

    it('gives the last segment as written, as a label of last resort', () => {
        expect(lastSegmentLabel('Report "Sales - Quote" - Property Caption')).toBe('Property Caption');
        expect(lastSegmentLabel('Namespace X - Report "Sales - Quote"')).toBe('Report "Sales - Quote"');
        expect(lastSegmentLabel('1')).toBe('1');
    });
});

describe('parseUnitId', () => {
    it('reads a hashed segment as type and hash', () => {
        expect(parseUnitId('Table 3783554337 - Property 2879900210')).toEqual([
            { type: 'Table', value: '3783554337', hash: '3783554337' },
            { type: 'Property', value: '2879900210', hash: '2879900210' },
        ]);
    });

    it('reads a readable segment as type and name, unquoted', () => {
        expect(parseUnitId('Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption')).toEqual([
            { type: 'Namespace', value: 'Contoso.Sales', name: 'Contoso.Sales' },
            { type: 'Report', value: '"Sales - Quote"', name: 'Sales - Quote' },
            { type: 'Property', value: 'Caption', name: 'Caption' },
        ]);
    });

    it('unescapes a doubled quote in a quoted name', () => {
        expect(parseUnitId('Table "Say ""Hi"""')[0].name).toBe('Say "Hi"');
    });

    it('reads a quoted all-digit name as a name, not a hash', () => {
        expect(parseUnitId('Page Contoso - Method "12345"')[1]).toEqual({ type: 'Method', value: '"12345"', name: '12345' });
    });

    it('reads the one negative hash AL can write', () => {
        expect(parseUnitId('Table -1 - Property 2879900210')[0]).toEqual({ type: 'Table', value: '-1', hash: '-1' });
    });

    it('keeps a segment with no value rather than dropping it', () => {
        expect(parseUnitId('1')).toEqual([{ type: '1', value: '' }]);
    });
});

describe('canonicalPath', () => {
    it('leaves a hashed id exactly as it is', () => {
        const id = 'Table 3783554337 - Field 4264183382 - Property 2879900210';
        expect(canonicalPath(parseUnitId(id))).toBe(id);
    });

    it('writes the readable and the hashed form of one path identically', () => {
        const readable = 'Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption';
        const hashed = `Namespace ${alNameHash('Contoso.Sales')} - Report ${alNameHash('Sales - Quote')} - Property ${alNameHash('Caption')}`;
        expect(canonicalPath(parseUnitId(readable))).toBe(hashed);
        expect(canonicalPath(parseUnitId(hashed))).toBe(hashed);
    });

    it('hashes a quoted all-digit name like any other name', () => {
        expect(canonicalSegment(parseUnitId('Method "12345"')[0])).toBe(`Method ${alNameHash('12345')}`);
    });

    it('leaves a segment with no value as written', () => {
        expect(canonicalPath(parseUnitId('1'))).toBe('1');
    });
});

describe('every corpus id', () => {
    it.each(CORPUS)('%s: parses as the plain split did, and is its own canonical path', (file) => {
        for (const unit of unitsOf(file)) {
            expect(splitUnitId(unit.id), unit.id).toEqual(unit.id.split(' - '));
            expect(canonicalPath(parseUnitId(unit.id)), unit.id).toBe(unit.id);
        }
    });

    it.each(CORPUS)('%s: carries in every segment the hash of the name its note gives', (file) => {
        for (const unit of unitsOf(file)) {
            const names = namesFromNote(unit.id, generatorNote(unit));
            expect(names, unit.id).not.toBeNull();
            parseUnitId(unit.id).forEach((segment, index) => {
                expect(segment.hash, `${unit.id} #${index}`).toBe(alNameHash(names?.[index] ?? ''));
            });
        }
    });
});

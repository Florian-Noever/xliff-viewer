import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    developerHint,
    developerNote,
    generatorNote,
    hasAlStructure,
    namesFromNote,
} from '../../extension/xliff/names';
import { parseXliff } from '../../extension/xliff/parser';
import { parseUnitId } from '../../extension/xliff/unitId';
import { iterateUnits } from '../../shared/model';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const unitsOf = (name: string) => [...iterateUnits(parseXliff(readFileSync(`${FIXTURES}/${name}`, 'utf8')))];

describe('hasAlStructure', () => {
    it('accepts a hashed AL id', () => {
        expect(hasAlStructure('Table 3952258696 - Property 2879900210')).toBe(true);
    });

    it('accepts a readable AL id, quoted names and all', () => {
        expect(hasAlStructure('Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption')).toBe(true);
    });

    it('rejects an id with a segment that carries no value', () => {
        // id="1" is a legal XLIFF id carrying no AL structure.
        expect(hasAlStructure('1')).toBe(false);
        expect(hasAlStructure('Table 3952258696 - Property')).toBe(false);
    });
});

describe('namesFromNote', () => {
    it('extracts one name per segment', () => {
        expect(namesFromNote(
            'Table 3952258696 - Field 2985504065 - Property 2879900210',
            'Table PTE Contoso Methods Setup - Field Contoso Method - Property Caption',
        )).toEqual(['PTE Contoso Methods Setup', 'Contoso Method', 'Caption']);
    });

    it('keeps an object name that itself contains the separator', () => {
        // The whole reason for the anchored regex: splitting on " - " breaks such a name.
        expect(namesFromNote(
            'Report 4004390371 - Property 2879900210',
            'Report PTE Sales - Quote - Property Caption',
        )).toEqual(['PTE Sales - Quote', 'Caption']);
    });

    it('handles a name with both a separator and dots', () => {
        expect(namesFromNote(
            'Report 1361272465 - NamedType 1870740906',
            'Report PTE Calc. Plan - Plan. Wksh. - NamedType Text011Lbl',
        )).toEqual(['PTE Calc. Plan - Plan. Wksh.', 'Text011Lbl']);
    });

    it('handles a four-segment path', () => {
        expect(namesFromNote(
            'PageExtension 1 - Action 2 - Method 3 - NamedType 4',
            'PageExtension Cust List - Action Approve - Method OnAction - NamedType Msg001',
        )).toEqual(['Cust List', 'Approve', 'OnAction', 'Msg001']);
    });

    it('returns null rather than guessing when the note does not match', () => {
        expect(namesFromNote('Table 1 - Property 2', 'Page Something - Property Caption')).toBeNull();
        expect(namesFromNote('Table 1 - Property 2', 'nonsense')).toBeNull();
    });

    it('returns null for a missing or empty note, without throwing', () => {
        expect(namesFromNote('Table 1 - Property 2', undefined)).toBeNull();
        expect(namesFromNote('Table 1 - Property 2', '')).toBeNull();
    });

    it('anchors on the types of a readable id, quoted names and all', () => {
        expect(namesFromNote(
            'Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption',
            'Namespace Contoso.Sales - Report Sales - Quote - Property Caption',
        )).toEqual(['Contoso.Sales', 'Sales - Quote', 'Caption']);
    });

    it('escapes regex metacharacters in a segment type', () => {
        // A type containing a dot must match literally, not as "any character".
        expect(namesFromNote('Trans. 1 - Property 2', 'TransX Name - Property Caption')).toBeNull();
        expect(namesFromNote('Trans. 1 - Property 2', 'Trans. Name - Property Caption'))
            .toEqual(['Name', 'Caption']);
    });
});

describe('names for every corpus unit', () => {
    // The regression guard for the whole naming approach. It is an exact count on
    // purpose: a percentage threshold would let a regression hide.
    it.each([
        ['Contoso App.g.xlf', 500],
        ['Fabrikam Base.de-DE.xlf', 2500],
    ])('%s: every one of %i units yields names', (file, expected) => {
        const units = unitsOf(file);
        expect(units).toHaveLength(expected);

        const named = units.filter(unit => namesFromNote(unit.id, generatorNote(unit)) !== null);
        expect(named).toHaveLength(expected);
    });

    it('produces one name per id segment, for every unit', () => {
        for (const unit of unitsOf('Fabrikam Base.de-DE.xlf')) {
            const names = namesFromNote(unit.id, generatorNote(unit));
            expect(names, unit.id).not.toBeNull();
            expect(names, unit.id).toHaveLength(parseUnitId(unit.id).length);
        }
    });

    it('never yields an empty name', () => {
        for (const unit of unitsOf('Contoso App.g.xlf')) {
            for (const name of namesFromNote(unit.id, generatorNote(unit)) ?? []) {
                expect(name.length, unit.id).toBeGreaterThan(0);
            }
        }
    });
});

describe('note lookup', () => {
    it('finds the generator and developer notes by their from attribute', () => {
        // The reverse of the order AL writes them in, so a lookup by position would fail.
        const unit = {
            attributes: {},
            id: 'a',
            translate: true,
            source: 's',
            notes: [
                { attributes: { from: 'Xliff Generator' }, from: 'Xliff Generator', value: 'Table PTE Contoso Methods Setup - Property Caption' },
                { attributes: { from: 'Developer' }, from: 'Developer', value: 'de-DE=Contoso Methoden Einrichtung' },
            ],
        };
        expect(generatorNote(unit)).toBe('Table PTE Contoso Methods Setup - Property Caption');
        expect(developerNote(unit)).toBe('de-DE=Contoso Methoden Einrichtung');
    });

    it('returns undefined when a note is absent', () => {
        const unit = { attributes: {}, id: 'a', translate: true, source: 's', notes: [] };
        expect(generatorNote(unit)).toBeUndefined();
        expect(developerNote(unit)).toBeUndefined();
    });
});

describe('developerHint', () => {
    it('splits the usual lang=suggestion form', () => {
        expect(developerHint('de-DE=Contoso Methoden Name')).toEqual({
            language: 'de-DE',
            text: 'Contoso Methoden Name',
        });
    });

    it('accepts a bare two-letter language', () => {
        expect(developerHint('de=Hallo')).toEqual({ language: 'de', text: 'Hallo' });
    });

    it('returns free text whole, without inventing a language', () => {
        // An unanchored prefix rule would read "%1 " as a language and mangle the note.
        expect(developerHint('%1 = Document No.')).toEqual({ text: '%1 = Document No.' });
        expect(developerHint('Erstellt am')).toEqual({ text: 'Erstellt am' });
        expect(developerHint('Verkauf - Auftragsbestätigung %1')).toEqual({
            text: 'Verkauf - Auftragsbestätigung %1',
        });
    });

    it('returns undefined for an absent or empty note', () => {
        expect(developerHint(undefined)).toBeUndefined();
        expect(developerHint('')).toBeUndefined();
    });

    it('keeps an empty suggestion after a real prefix', () => {
        expect(developerHint('de-DE=')).toEqual({ language: 'de-DE', text: '' });
    });

    it('parses every developer note in the corpus without throwing', () => {
        for (const unit of unitsOf('Fabrikam Base.de-DE.xlf')) {
            expect(() => developerHint(developerNote(unit)), unit.id).not.toThrow();
        }
    });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { alNameHash } from '../../extension/xliff/alNameHash';
import {
    developerHint,
    developerNote,
    generatorNote,
    hasAlStructure,
    readGeneratorNote,
} from '../../extension/xliff/names';
import { parseXliff } from '../../extension/xliff/parser';
import { parseUnitId } from '../../extension/xliff/unitId';
import { iterateUnits } from '../../shared/model';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const unitsOf = (name: string) => [...iterateUnits(parseXliff(readFileSync(`${FIXTURES}/${name}`, 'utf8')))];
const h = alNameHash;

const read = (id: string, note: string | undefined) => readGeneratorNote(parseUnitId(id), note);
/** The declaring object's name, then one per segment after the root. */
const namesOf = (id: string, note: string | undefined): string[] | undefined => {
    const reading = read(id, note);
    return reading === undefined ? undefined : [reading.declaring.name, ...reading.names];
};

describe('hasAlStructure', () => {
    it('accepts a hashed AL id', () => {
        expect(hasAlStructure(`Table ${h('PTE Contoso Methods Setup')} - Property 2879900210`)).toBe(true);
    });

    it('accepts a readable AL id, quoted names and all', () => {
        expect(hasAlStructure('Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption')).toBe(true);
    });

    it('rejects an id with a segment that carries no value', () => {
        // id="1" is a legal XLIFF id carrying no AL structure.
        expect(hasAlStructure('1')).toBe(false);
        expect(hasAlStructure(`Table ${h('PTE Contoso Methods Setup')} - Property`)).toBe(false);
    });
});

describe('readGeneratorNote', () => {
    it('reads the declaring object, then one name per segment after it', () => {
        expect(read(
            `Table ${h('PTE Contoso Methods Setup')} - Field ${h('Contoso Method')} - Property 2879900210`,
            'Table PTE Contoso Methods Setup - Field Contoso Method - Property Caption',
        )).toEqual({ declaring: { type: 'Table', name: 'PTE Contoso Methods Setup' }, names: ['Contoso Method', 'Caption'] });
    });

    it('keeps an object name that itself contains the separator', () => {
        // The whole reason for anchoring on types: splitting on " - " breaks such a name.
        expect(namesOf(
            `Report ${h('Contoso Orders - Summary')} - Property ${h('Caption')}`,
            'Report Contoso Orders - Summary - Property Caption',
        )).toEqual(['Contoso Orders - Summary', 'Caption']);
    });

    it('handles a name with both a separator and dots', () => {
        expect(namesOf(
            `Report ${h('Contoso Calc. Lines - Req. Wksh.')} - NamedType ${h('Text042Lbl')}`,
            'Report Contoso Calc. Lines - Req. Wksh. - NamedType Text042Lbl',
        )).toEqual(['Contoso Calc. Lines - Req. Wksh.', 'Text042Lbl']);
    });

    it('handles a four-segment path', () => {
        expect(namesOf(
            'PageExtension 1 - Action 2 - Method 3 - NamedType 4',
            'PageExtension Cust List - Action Approve - Method OnAction - NamedType Msg001',
        )).toEqual(['Cust List', 'Approve', 'OnAction', 'Msg001']);
    });

    it('takes the split whose names hash to the id, where a name holds a later anchor', () => {
        // The first split reads the report as "Sales"; only the second one's names are the id's.
        expect(namesOf(
            `Report ${h('Sales - Property List')} - Property ${h('Caption')}`,
            'Report Sales - Property List - Property Caption',
        )).toEqual(['Sales - Property List', 'Caption']);
    });

    it('leaves the root\'s type open: a folded extension\'s note names the extension', () => {
        expect(read(
            `Table ${h('Contoso Item')} - Field ${h('Extra')} - Property ${h('Caption')}`,
            'TableExtension Contoso Item Ext. - Field Extra - Property Caption',
        )).toEqual({ declaring: { type: 'TableExtension', name: 'Contoso Item Ext.' }, names: ['Extra', 'Caption'] });
    });

    it('reads a namespaced note, whether the id is readable or hashed', () => {
        const note = 'Namespace Contoso.Sales - Report Sales - Quote - Property Caption';
        const expected = { declaring: { type: 'Report', name: 'Sales - Quote', namespace: 'Contoso.Sales' }, names: ['Caption'] };

        expect(read('Namespace Contoso.Sales - Report "Sales - Quote" - Property Caption', note)).toEqual(expected);
        expect(read(`Namespace ${h('Contoso.Sales')} - Report ${h('Sales - Quote')} - Property ${h('Caption')}`, note)).toEqual(expected);
    });

    it('returns undefined rather than guessing when the note does not fit the id', () => {
        expect(read('Table 1 - Field 2 - Property 3', 'Table Customer - Property Caption')).toBeUndefined();
        expect(read('Table 1 - Property 2', 'nonsense')).toBeUndefined();
    });

    it('returns undefined for a missing or empty note, without throwing', () => {
        expect(read('Table 1 - Property 2', undefined)).toBeUndefined();
        expect(read('Table 1 - Property 2', '')).toBeUndefined();
    });

    it('finds an anchor literally, a type with regex metacharacters included', () => {
        expect(read('Table 1 - Fi.ld 2 - Property 3', 'Table Customer - FiXld Name - Property Caption')).toBeUndefined();
        expect(namesOf('Table 1 - Fi.ld 2 - Property 3', 'Table Customer - Fi.ld Name - Property Caption')).toEqual(['Customer', 'Name', 'Caption']);
    });

    it('settles on a note full of separators rather than weighing every split', () => {
        // Unbounded, two thousand anchors per level would be millions of splits to weigh.
        const note = `Table ${'A - Field '.repeat(2000)}B - Field C - Property Caption`;

        expect(read('Table 1 - Field 2 - Field 3 - Property 4', note)).toBeDefined();
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

        const named = units.filter(unit => read(unit.id, generatorNote(unit)) !== undefined);
        expect(named).toHaveLength(expected);
    });

    it('produces one name per id segment, for every unit', () => {
        for (const unit of unitsOf('Fabrikam Base.de-DE.xlf')) {
            expect(namesOf(unit.id, generatorNote(unit)), unit.id).toHaveLength(parseUnitId(unit.id).length);
        }
    });

    it('never yields an empty name', () => {
        for (const unit of unitsOf('Contoso App.g.xlf')) {
            for (const name of namesOf(unit.id, generatorNote(unit)) ?? []) {
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
    it('gives the suggestion for the file\'s own language, whatever its case', () => {
        expect(developerHint('de-DE=Contoso Methoden Name', 'de-DE')).toBe('Contoso Methoden Name');
        expect(developerHint('de-DE=Kunde', 'DE-de')).toBe('Kunde');
        expect(developerHint('de-DE=Kunde', 'de-de')).toBe('Kunde');
        expect(developerHint('de=Hallo', 'de')).toBe('Hallo');
    });

    it('gives nothing for another language', () => {
        expect(developerHint('de-DE=Kunde', 'fr-FR')).toBeUndefined();
    });

    it('picks the language\'s entry from a note that names several, the first if it repeats', () => {
        expect(developerHint('de-DE=Kunde|fr-FR=Client', 'fr-FR')).toBe('Client');
        expect(developerHint('de-DE=Kunde|fr-FR=Client', 'de-DE')).toBe('Kunde');
        expect(developerHint('de-DE=Kunde | fr-FR=Client', 'fr-FR')).toBe('Client');
        expect(developerHint('de-DE=Kunde | fr-FR=Client', 'de-DE')).toBe('Kunde');
        expect(developerHint('de-DE=Erste|de-DE=Zweite', 'de-DE')).toBe('Erste');
    });

    it('keeps a | that starts no other entry as part of the text', () => {
        expect(developerHint('de-DE=A|B', 'de-DE')).toBe('A|B');
    });

    it('makes no suggestion from free text', () => {
        // An unanchored rule would read "%1 " as a language and mangle the note.
        for (const note of ['%1 = Document No.', 'Erstellt am', 'Verkauf - Auftragsbestätigung %1']) {
            expect(developerHint(note, 'de-DE'), note).toBeUndefined();
        }
    });

    it('counts an empty suggestion as none', () => {
        expect(developerHint('de-DE=', 'de-DE')).toBeUndefined();
    });

    it('accepts a three-letter language', () => {
        expect(developerHint('fil-PH=Kamusta', 'fil-PH')).toBe('Kamusta');
    });

    it('gives nothing without a note or a target language', () => {
        expect(developerHint(undefined, 'de-DE')).toBeUndefined();
        expect(developerHint('', 'de-DE')).toBeUndefined();
        expect(developerHint('de-DE=Kunde', undefined)).toBeUndefined();
    });

    it('parses every developer note in the corpus without throwing', () => {
        for (const unit of unitsOf('Fabrikam Base.de-DE.xlf')) {
            expect(() => developerHint(developerNote(unit), 'de-DE'), unit.id).not.toThrow();
        }
    });
});

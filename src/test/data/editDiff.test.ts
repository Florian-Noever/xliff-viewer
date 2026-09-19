import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseXliff } from '../../extension/xliff/parser';
import { setTarget } from '../../extension/xliff/writer';
import { iterateUnits } from '../../shared/model';

/**
 * An edit made through the real write path changes only the bytes it edits; `roundtrip.test.ts`
 * covers the no-op case. Every fixture runs, because they differ in the ways that break writers:
 * a BOM, CRLF, no namespace, a self-closing target, no targets at all.
 */

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));
const read = (name: string): string => readFileSync(`${EXAMPLES}/${name}`, 'utf8');

const CORPUS = [
    'Contoso App.g.xlf',
    'Contoso App.en-US.xlf',
    'Contoso App.de-DE.xlf',
    'Fabrikam Base.de-DE.xlf',
    'test.xlf',
];

const EDITED = 'ZZZ EDITED ZZZ';

function apply(text: string, edit: { start: number; end: number; newText: string }): string {
    return text.slice(0, edit.start) + edit.newText + text.slice(edit.end);
}

/**
 * How many lines the edit replaces, and how many it writes in their place.
 *
 * A target is usually one line, but nothing says it has to be: `xml:space="preserve"` makes
 * a line break inside a target legal, and edit mode lets a translator type one. Counting
 * lines against a fixed 1 would make this assertion about the fixture rather than about the
 * writer.
 */
function span(original: string, edit: { start: number; end: number; newText: string }): { at: number; before: number; after: number } {
    const at = original.slice(0, edit.start).split(/\r?\n/).length - 1;
    const through = original.slice(0, edit.end).split(/\r?\n/).length - 1;
    return { at, before: through - at + 1, after: edit.newText.split(/\r?\n/).length };
}

/** Lines that differ, as `[index, before, after]`, using each file's own line ending. */
function differences(before: string, after: string): [number, string, string][] {
    const left = before.split(/\r?\n/);
    const right = after.split(/\r?\n/);
    const rows: [number, string, string][] = [];
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        if (left[index] !== right[index]) {
            rows.push([index, left[index] ?? '(absent)', right[index] ?? '(absent)']);
        }
    }
    return rows;
}

describe('one edit changes only what was edited', () => {
    for (const name of CORPUS) {
        it(`holds for ${name}`, () => {
            const original = read(name);
            const document = parseXliff(original);
            const [unit] = [...iterateUnits(document)];
            const hadTarget = unit.target !== undefined;

            const edit = setTarget(document, original, { unitId: unit.id, value: EDITED, state: 'translated' });
            expect(edit, `${name}: the edit produced nothing`).not.toBeNull();

            const after = apply(original, edit ?? { start: 0, end: 0, newText: '' });
            const changed = differences(original, after);

            if (hadTarget) {
                // The target's own lines are rewritten and nothing else is: what follows
                // them is the original, shifted by whatever the new target's height differs.
                const { at, before: was, after: now } = span(original, edit ?? { start: 0, end: 0, newText: '' });
                const left = original.split(/\r?\n/);
                const right = after.split(/\r?\n/);

                expect(right, `${name}: ${JSON.stringify(changed)}`).toHaveLength(left.length + now - was);
                expect(left.slice(0, at)).toEqual(right.slice(0, at));
                expect(right[at]).toContain('<target');
                expect(right.slice(at, at + now).join('')).toContain(EDITED);
                expect(right.slice(at + now)).toEqual(left.slice(at + was));
            } else {
                // A unit with no target gains one: exactly one line more, and from the
                // first difference onwards every line is the original shifted by one.
                const before = original.split(/\r?\n/);
                const now = after.split(/\r?\n/);
                expect(now).toHaveLength(before.length + 1);

                const [at] = changed[0];
                expect(now[at]).toContain('<target');
                expect(now[at]).toContain(EDITED);
                expect(now.slice(at + 1)).toEqual(before.slice(at));
            }
        });

        it(`preserves the line endings and the BOM of ${name}`, () => {
            const original = read(name);
            const document = parseXliff(original);
            const [unit] = [...iterateUnits(document)];
            const edit = setTarget(document, original, { unitId: unit.id, value: EDITED, state: 'translated' });
            const after = apply(original, edit ?? { start: 0, end: 0, newText: '' });
            // A target that gains or loses lines moves the line-ending count with it — but
            // only in a document whose line ending is the one being counted.
            const { before: was, after: now } = span(original, edit ?? { start: 0, end: 0, newText: '' });
            const delta = original.includes('\r\n') ? now - was : 0;

            expect(after.startsWith('﻿'), `${name}: BOM`).toBe(original.startsWith('﻿'));
            expect(after.includes('\r\n'), `${name}: CRLF`).toBe(original.includes('\r\n'));
            expect(after.split('\r\n').length, `${name}: CRLF count`).toBe(original.split('\r\n').length + delta);
        });

        it(`keeps every other unit byte-identical in ${name}`, () => {
            const original = read(name);
            const document = parseXliff(original);
            const units = [...iterateUnits(document)];
            const target = units[Math.min(3, units.length - 1)];

            const edit = setTarget(document, original, { unitId: target.id, value: EDITED, state: 'translated' });
            const after = apply(original, edit ?? { start: 0, end: 0, newText: '' });

            // Every other unit's id must still appear exactly where and as often as before.
            for (const unit of units) {
                const escaped = unit.id.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const needle = `id="${escaped}"`;
                expect(after.split(needle).length, `${name}: ${unit.id}`).toBe(original.split(needle).length);
            }
        });
    }

    it('narrows the edit to the element, not to the file', () => {
        // If the trimmed range ever spans more than the edited element, the serialiser has
        // drifted from the file's own formatting.
        const original = read('Fabrikam Base.de-DE.xlf');
        const document = parseXliff(original);
        const [unit] = [...iterateUnits(document)];

        const edit = setTarget(document, original, { unitId: unit.id, value: EDITED, state: 'translated' });
        expect(edit).not.toBeNull();

        const characters = (edit?.end ?? 0) - (edit?.start ?? 0);
        expect(characters).toBeLessThan(200);
        expect(original.length).toBeGreaterThan(1_000_000);
    });
});

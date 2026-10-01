import { assert, describe, expect, it } from 'vitest';

import { parseXliff } from '../../extension/xliff/parser';
import { encodeAttribute } from '../../extension/xliff/serialise';
import { setTarget } from '../../extension/xliff/writer';
import { escapeRegExp } from '../../shared/escapeRegExp';
import { iterateUnits } from '../../shared/model';
import { FIXTURE, FIXTURE_NAMES, readFixture } from '../support/fixtures';

/**
 * An edit made through the real write path changes only the bytes it edits; `roundtrip.test.ts`
 * covers the no-op case. Every fixture runs, because they differ in the ways that break writers:
 * a BOM, CRLF, no namespace, a self-closing target, no targets at all.
 */

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
    for (const name of FIXTURE_NAMES) {
        it(`holds for ${name}`, () => {
            const original = readFixture(name);
            const document = parseXliff(original);
            const [unit] = [...iterateUnits(document)];
            const hadTarget = unit.target !== undefined;

            const edit = setTarget(document, original, { fileIndex: 0, unitId: unit.id, value: EDITED, state: 'translated' });
            assert.exists(edit, `${name}: the edit produced nothing`);

            const after = apply(original, edit);
            const changed = differences(original, after);

            if (hadTarget) {
                // The target's own lines are rewritten and nothing else is: what follows
                // them is the original, shifted by whatever the new target's height differs.
                const { at, before: was, after: now } = span(original, edit);
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
            const original = readFixture(name);
            const document = parseXliff(original);
            const [unit] = [...iterateUnits(document)];
            const edit = setTarget(document, original, { fileIndex: 0, unitId: unit.id, value: EDITED, state: 'translated' });
            assert.exists(edit, `${name}: the edit produced nothing`);
            const after = apply(original, edit);
            // A target that gains or loses lines moves the line-ending count with it — but
            // only in a document whose line ending is the one being counted.
            const { before: was, after: now } = span(original, edit);
            const delta = original.includes('\r\n') ? now - was : 0;

            expect(after.startsWith('﻿'), `${name}: BOM`).toBe(original.startsWith('﻿'));
            expect(after.includes('\r\n'), `${name}: CRLF`).toBe(original.includes('\r\n'));
            expect(after.split('\r\n').length, `${name}: CRLF count`).toBe(original.split('\r\n').length + delta);
        });

        it(`keeps every other unit byte-identical in ${name}`, () => {
            const original = readFixture(name);
            const document = parseXliff(original);
            const units = [...iterateUnits(document)];
            const edited = units[Math.min(3, units.length - 1)];

            const edit = setTarget(document, original, { fileIndex: 0, unitId: edited.id, value: EDITED, state: 'translated' });
            assert.exists(edit, `${name}: the edit produced nothing`);

            // An edit inside the edited unit's own element leaves every other unit as it was.
            const element = new RegExp(`<trans-unit[^>]*\\sid="${escapeRegExp(encodeAttribute(edited.id))}"`).exec(original);
            assert.exists(element, `${name}: ${edited.id} is not in the text`);
            const elementEnd = original.indexOf('</trans-unit>', element.index) + '</trans-unit>'.length;

            expect(edit.start, `${name}: the edit starts before the unit`).toBeGreaterThanOrEqual(element.index);
            expect(edit.end, `${name}: the edit ends after the unit`).toBeLessThanOrEqual(elementEnd);
        });
    }

    it('narrows the edit to the element, not to the file', () => {
        // If the trimmed range ever spans more than the edited element, the serialiser has
        // drifted from the file's own formatting.
        const original = readFixture(FIXTURE.large);
        const document = parseXliff(original);
        const [unit] = [...iterateUnits(document)];

        const edit = setTarget(document, original, { fileIndex: 0, unitId: unit.id, value: EDITED, state: 'translated' });
        assert.exists(edit);

        const characters = edit.end - edit.start;
        expect(characters).toBeLessThan(200);
        expect(original.length).toBeGreaterThan(1_000_000);
    });
});

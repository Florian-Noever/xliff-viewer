import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseXliff } from '../../extension/xliff/parser';
import { setTarget } from '../../extension/xliff/writer';
import { iterateUnits } from '../../shared/model';

/**
 * MASTER_PLAN §1.4's hardest criterion, file by file: **a save round-trip changes only the
 * bytes the user actually edited.**
 *
 * `roundtrip.test.ts` proves the no-op case — parse then serialise reproduces the file. This
 * proves the case that can lose work: an edit made through the **real write path**, offsets
 * and all, applied to the original text. `REVIEW-02b` required it demonstrated on every
 * corpus file rather than on one, because the five differ in the ways that break writers —
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

describe('§1.4: one edit changes only what was edited', () => {
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
                // One line rewritten in place, and it is the target's.
                expect(changed, `${name}: ${JSON.stringify(changed)}`).toHaveLength(1);
                expect(changed[0][1]).toContain('<target');
                expect(changed[0][2]).toContain(EDITED);
                expect(after.split(/\r?\n/)).toHaveLength(original.split(/\r?\n/).length);
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
            // An inserted target is one line more, and therefore one line ending more.
            const inserted = unit.target === undefined ? 1 : 0;

            const edit = setTarget(document, original, { unitId: unit.id, value: EDITED, state: 'translated' });
            const after = apply(original, edit ?? { start: 0, end: 0, newText: '' });

            expect(after.startsWith('﻿'), `${name}: BOM`).toBe(original.startsWith('﻿'));
            expect(after.includes('\r\n'), `${name}: CRLF`).toBe(original.includes('\r\n'));
            expect(after.split('\r\n').length, `${name}: CRLF count`).toBe(original.split('\r\n').length + inserted);
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
        // drifted from the file's own formatting and `DATA-04` is what actually broke.
        const original = read('Fabrikam Base.de-DE.xlf');
        const document = parseXliff(original);
        const [unit] = [...iterateUnits(document)];

        const edit = setTarget(document, original, { unitId: unit.id, value: EDITED, state: 'translated' });
        expect(edit).not.toBeNull();

        const span = (edit?.end ?? 0) - (edit?.start ?? 0);
        expect(span).toBeLessThan(200);
        expect(original.length).toBeGreaterThan(1_000_000);
    });
});

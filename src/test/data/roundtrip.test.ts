import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseXliff } from '../../extension/xliff/parser';
import { serialiseXliff } from '../../extension/xliff/serialise';

/**
 * **The single most important test in the project** (MASTER_PLAN §15.2).
 *
 * With a whole-file writer, a serialiser bug does not corrupt one element — it rewrites
 * the entire document. If a corpus file will not round-trip, the parser lost information:
 * fix the parser, never weaken the assertion.
 */

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));
const read = (name: string): string => readFileSync(`${EXAMPLES}/${name}`, 'utf8');
const roundTrip = (text: string): string => serialiseXliff(parseXliff(text));

/** Reports the first differing line, so a failure says where rather than just "not equal". */
function firstDifference(a: string, b: string): string {
    if (a === b) {
        return '';
    }
    const left = a.split(/\r?\n/);
    const right = b.split(/\r?\n/);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        if (left[index] !== right[index]) {
            return `line ${index + 1}\n  original: ${JSON.stringify(left[index])}\n  rebuilt : ${JSON.stringify(right[index])}`;
        }
    }
    return 'identical line-by-line but not byte-identical (line endings or trailing newline)';
}

const CORPUS = readdirSync(EXAMPLES);

describe('round-trip invariant', () => {
    it('the corpus is the five files the plan describes', () => {
        expect(CORPUS).toHaveLength(5);
    });

    // Asserted per file so a failure names the file (acceptance criterion).
    it.each(CORPUS)('%s is byte-identical after parse → serialise', (name) => {
        const original = read(name);
        const rebuilt = roundTrip(original);
        expect(rebuilt, firstDifference(original, rebuilt)).toBe(original);
    });

    it('preserves the BOM and CRLF of the base file', () => {
        const original = read('Contoso App.g.xlf');
        const rebuilt = roundTrip(original);

        expect(rebuilt.charCodeAt(0)).toBe(0xfeff);
        expect(rebuilt.includes('\r\n')).toBe(true);
        expect(rebuilt).toBe(original);
    });

    it('round-trips the namespace-less, non-AL file', () => {
        const original = read('test.xlf');
        expect(roundTrip(original)).toBe(original);
    });

    it('adds no trailing newline, because no corpus file has one', () => {
        for (const name of CORPUS) {
            const original = read(name);
            expect(/\r?\n$/.test(original), `${name} unexpectedly ends with a newline`).toBe(false);
            expect(/\r?\n$/.test(roundTrip(original)), `${name} gained a trailing newline`).toBe(false);
        }
    });

    it('is idempotent — serialising twice changes nothing further', () => {
        for (const name of CORPUS) {
            const once = roundTrip(read(name));
            expect(roundTrip(once), name).toBe(once);
        }
    });

});

describe('a single edit changes only that target', () => {
    it('touches nothing outside the edited <target> element', () => {
        const original = read('Contoso App.de-DE.xlf');
        const document = parseXliff(original);

        const unit = document.files[0].body.groups[0].units[3];
        const before = unit.target;
        if (before === undefined) {
            throw new Error('fixture unit has no target');
        }

        // Edit mode replaces the target rather than mutating it (`DEC-025`).
        unit.target = { ...before, value: 'ZZZ EDITED ZZZ' };

        const rebuilt = serialiseXliff(document);
        expect(rebuilt).not.toBe(original);

        const originalLines = original.split('\n');
        const rebuiltLines = rebuilt.split('\n');
        expect(rebuiltLines).toHaveLength(originalLines.length);

        const changed = originalLines
            .map((line, index) => (line === rebuiltLines[index] ? -1 : index))
            .filter(index => index >= 0);

        expect(changed).toHaveLength(1);
        expect(originalLines[changed[0]]).toContain('<target');
        expect(rebuiltLines[changed[0]]).toContain('ZZZ EDITED ZZZ');
    });

    it('clearing a target produces the self-closing form AL emits', () => {
        const document = parseXliff(read('Contoso App.de-DE.xlf'));
        const unit = document.files[0].body.groups[0].units[0];
        if (unit.target === undefined) {
            throw new Error('fixture unit has no target');
        }
        unit.target = { ...unit.target, value: '', attributes: { state: 'needs-translation' } };

        const rebuilt = serialiseXliff(document);
        // No space before "/>" — 360 targets in the corpus depend on this.
        expect(rebuilt).toContain('<target state="needs-translation"/>');
        expect(rebuilt).not.toContain('<target state="needs-translation" />');
    });
});

describe('encoding', () => {
    const wrap = (inner: string): string =>
        `<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en"><body>${inner}</body></file></xliff>`;

    it('re-encodes &, < and > in text', () => {
        const document = parseXliff(wrap('<trans-unit id="a"><source>a &amp; b &lt;c&gt; d</source></trans-unit>'));
        expect(document.files[0].body.units[0].source).toBe('a & b <c> d');
        expect(serialiseXliff(document)).toContain('<source>a &amp; b &lt;c&gt; d</source>');
    });

    it('encodes > even where it is optional, as the corpus does', () => {
        const fabrikam = read('Fabrikam Base.de-DE.xlf');
        expect(fabrikam).toContain('&gt;');
        expect(roundTrip(fabrikam)).toBe(fabrikam);
    });

    it('encodes double quotes inside attribute values', () => {
        const document = parseXliff(wrap('<trans-unit id="a &quot;quoted&quot; b"><source>x</source></trans-unit>'));
        expect(document.files[0].body.units[0].id).toBe('a "quoted" b');
        expect(serialiseXliff(document)).toContain('id="a &quot;quoted&quot; b"');
    });

    it('writes a numeric character reference back as the literal character (DEC-026)', () => {
        // A documented, accepted byte change: valid XML, identical meaning. The
        // alternative silently corrupts the é into visible "&#233;".
        const rebuilt = roundTrip(wrap('<trans-unit id="a"><source>caf&#233;</source></trans-unit>'));
        expect(rebuilt).toContain('<source>café</source>');
        expect(rebuilt).not.toContain('&amp;#233;');
    });

    it('re-escapes an escaped ampersand, without confusing it for a reference', () => {
        const rebuilt = roundTrip(wrap('<trans-unit id="a"><source>caf&amp;#233;</source></trans-unit>'));
        expect(rebuilt).toContain('<source>caf&amp;#233;</source>');
    });
});

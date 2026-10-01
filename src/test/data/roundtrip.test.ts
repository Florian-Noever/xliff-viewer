import { describe, expect, it } from 'vitest';

import { parseXliff } from '../../extension/xliff/parser';
import { serialiseXliff } from '../../extension/xliff/serialise';
import { FIXTURE, FIXTURE_NAMES, readFixture } from '../support/fixtures';

/**
 * With a whole-file writer, a serialiser bug does not corrupt one element — it rewrites
 * the entire document. If a fixture will not round-trip, the parser lost information:
 * fix the parser, never weaken the assertion.
 */

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

describe('round-trip invariant', () => {
    // Asserted per file so a failure names the file.
    it.each(FIXTURE_NAMES)('%s is byte-identical after parse → serialise', (name) => {
        const original = readFixture(name);
        const rebuilt = roundTrip(original);
        expect(rebuilt, firstDifference(original, rebuilt)).toBe(original);
    });

    it('preserves the BOM and CRLF of the base file', () => {
        const original = readFixture(FIXTURE.base);
        const rebuilt = roundTrip(original);

        expect(rebuilt.charCodeAt(0)).toBe(0xfeff);
        expect(rebuilt.includes('\r\n')).toBe(true);
        expect(rebuilt).toBe(original);
    });

    it('adds no trailing newline to a file that has none', () => {
        for (const name of FIXTURE_NAMES) {
            const original = readFixture(name);
            expect(/\r?\n$/.test(original), `${name} unexpectedly ends with a newline`).toBe(false);
            expect(/\r?\n$/.test(roundTrip(original)), `${name} gained a trailing newline`).toBe(false);
        }
    });

    it('is idempotent — serialising twice changes nothing further', () => {
        for (const name of FIXTURE_NAMES) {
            const once = roundTrip(readFixture(name));
            expect(roundTrip(once), name).toBe(once);
        }
    });

});

describe('a target cleared through the model', () => {
    it('clearing a target produces the self-closing form AL emits', () => {
        const document = parseXliff(readFixture(FIXTURE.german));
        const unit = document.files[0].body.groups[0].units[0];
        if (unit.target === undefined) {
            throw new Error('fixture unit has no target');
        }
        unit.target = { ...unit.target, value: '', attributes: { state: 'needs-translation' } };

        const rebuilt = serialiseXliff(document);
        // No space before "/>", as AL writes it.
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

    it('encodes > even where it is optional, as AL does', () => {
        const large = readFixture(FIXTURE.large);
        expect(large).toContain('&gt;');
        expect(roundTrip(large)).toBe(large);
    });

    it('encodes double quotes inside attribute values', () => {
        const document = parseXliff(wrap('<trans-unit id="a &quot;quoted&quot; b"><source>x</source></trans-unit>'));
        expect(document.files[0].body.units[0].id).toBe('a "quoted" b');
        expect(serialiseXliff(document)).toContain('id="a &quot;quoted&quot; b"');
    });

    it('writes a numeric character reference back as the literal character', () => {
        // A byte change, but valid XML with identical meaning. The alternative silently
        // corrupts the é into visible "&#233;".
        const rebuilt = roundTrip(wrap('<trans-unit id="a"><source>caf&#233;</source></trans-unit>'));
        expect(rebuilt).toContain('<source>café</source>');
        expect(rebuilt).not.toContain('&amp;#233;');
    });

    it('re-escapes an escaped ampersand, without confusing it for a reference', () => {
        const rebuilt = roundTrip(wrap('<trans-unit id="a"><source>caf&amp;#233;</source></trans-unit>'));
        expect(rebuilt).toContain('<source>caf&amp;#233;</source>');
    });
});

describe('text that spans lines', () => {
    const document = (eol: string): string => [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<xliff version="1.2">',
        '  <file source-language="en-US" target-language="de-DE" original="App">',
        '    <body>',
        '      <trans-unit id="a">',
        '        <source>Line one',
        'Line two</source>',
        '        <target state="translated">Zeile eins',
        'Zeile zwei</target>',
        '      </trans-unit>',
        '    </body>',
        '  </file>',
        '</xliff>',
        '',
    ].join(eol);

    it.each([['CRLF', '\r\n'], ['LF', '\n']])('is byte-identical after parse → serialise in a %s file', (_name, eol) => {
        const original = document(eol);
        const rebuilt = roundTrip(original);
        expect(rebuilt, firstDifference(original, rebuilt)).toBe(original);
    });
});

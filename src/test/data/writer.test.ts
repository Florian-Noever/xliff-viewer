import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { XliffParseError } from '../../extension/xliff/errors';
import { parseXliff } from '../../extension/xliff/parser';
import { serialiseXliff } from '../../extension/xliff/serialise';
import { setState, setTarget, trimToEdit, type TextEditRange } from '../../extension/xliff/writer';
import { iterateUnits } from '../../shared/model';

import type { XliffDocument, XliffTransUnit } from '../../shared/model';

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));
const read = (name: string): string => readFileSync(`${EXAMPLES}/${name}`, 'utf8');

const LANGUAGE_FILE = 'Contoso App.de-DE.xlf';
const LARGE_FILE = 'Fabrikam Base.de-DE.xlf';
const BASE_FILE = 'Contoso App.g.xlf';

/** Narrows without a `!` assertion, which the project's lint rules forbid. */
function required<T>(value: T | null | undefined, what: string): T {
    if (value === null || value === undefined) {
        throw new Error(`expected ${what}`);
    }
    return value;
}

/** What the host will do with the edit: splice it into the current text. */
function apply(text: string, edit: TextEditRange): string {
    return text.slice(0, edit.start) + edit.newText + text.slice(edit.end);
}

function load(name: string): { text: string; document: XliffDocument; units: XliffTransUnit[] } {
    const text = read(name);
    const document = parseXliff(text);
    return { text, document, units: [...iterateUnits(document)] };
}

function isHighSurrogateAt(text: string, index: number): boolean {
    if (index < 0) {
        return false;
    }
    const code = text.charCodeAt(index);
    return code >= 0xd800 && code <= 0xdbff;
}

describe('trimToEdit', () => {
    it('returns null when nothing changed', () => {
        expect(trimToEdit('abc', 'abc')).toBeNull();
    });

    it('narrows to the middle', () => {
        expect(trimToEdit('hello world', 'hello brave world')).toEqual({
            start: 6,
            end: 6,
            newText: 'brave ',
        });
    });

    it('handles a pure deletion', () => {
        const edit = required(trimToEdit('abcdef', 'abef'), 'an edit');
        expect(apply('abcdef', edit)).toBe('abef');
    });

    it('handles a change at the very start and at the very end', () => {
        expect(apply('abc', required(trimToEdit('abc', 'Xbc'), 'an edit'))).toBe('Xbc');
        expect(apply('abc', required(trimToEdit('abc', 'abX'), 'an edit'))).toBe('abX');
    });

    it('never splits a surrogate pair', () => {
        // Two different astral characters: a naive scan stops between the surrogate
        // halves, producing an offset that is not a valid document position.
        const before = 'a\u{1F600}b';
        const after = 'a\u{1F601}b';
        const edit = required(trimToEdit(before, after), 'an edit');

        expect(isHighSurrogateAt(before, edit.start - 1)).toBe(false);
        expect(apply(before, edit)).toBe(after);
    });
});

describe('setTarget', () => {
    it('produces an edit covering only the edited <target>', () => {
        const { text, document, units } = load(LARGE_FILE);
        const edit = required(setTarget(document, text, { unitId: units[1200].id, value: 'NEUER WERT' }), 'an edit');

        const replaced = text.slice(edit.start, edit.end);
        // The whole document was serialised; the trim narrowed it to one element.
        expect(replaced).not.toContain('</trans-unit>');
        expect(replaced).not.toContain('<source>');
        expect(edit.newText).toContain('NEUER WERT');
    });

    it('splices back to exactly what the serialiser produced', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const edit = required(setTarget(document, text, { unitId: units[7].id, value: 'Anderer Text' }), 'an edit');
        expect(apply(text, edit)).toBe(serialiseXliff(document));
    });

    it('changes exactly one line', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const edit = required(setTarget(document, text, { unitId: units[3].id, value: 'Einzeilig' }), 'an edit');

        const before = text.split('\n');
        const after = apply(text, edit).split('\n');
        expect(after).toHaveLength(before.length);
        expect(before.filter((line, index) => line !== after[index])).toHaveLength(1);
    });

    it('returns null when the value and state are unchanged', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const unit = units[0];
        expect(setTarget(document, text, { unitId: unit.id, value: unit.target?.value ?? '' })).toBeNull();
    });

    it('leaves the model untouched when it returns null', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const unit = units[0];
        const before = unit.target;

        setTarget(document, text, { unitId: unit.id, value: unit.target?.value ?? '' });

        expect(unit.target).toBe(before);
        expect(serialiseXliff(document)).toBe(text);
    });

    it('writes the self-closing form when the value is cleared', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const edit = required(
            setTarget(document, text, { unitId: units[0].id, value: '', state: 'needs-translation' }),
            'an edit',
        );

        // Assert on the applied result: `newText` is only the differing span, because the
        // surrounding `<target state="` and `>` are common prefix and suffix.
        const result = apply(text, edit);
        expect(result).toContain('<target state="needs-translation"/>');
        expect(result).not.toContain('needs-translation" />');
    });

    it('inserts a target into a unit that has none, correctly indented', () => {
        // Every unit of the base file lacks a <target>.
        const { text, document, units } = load(BASE_FILE);
        const unit = units[5];
        expect(unit.target).toBeUndefined();

        const edit = required(
            setTarget(document, text, { unitId: unit.id, value: 'Übersetzt', state: 'translated' }),
            'an edit',
        );
        const result = apply(text, edit);
        expect(result).toBe(serialiseXliff(document));

        // One line added, indented to match its sibling <source>.
        const before = text.split('\r\n');
        const after = result.split('\r\n');
        expect(after).toHaveLength(before.length + 1);
        expect(after.find(line => line.includes('Übersetzt')))
            .toBe('          <target state="translated">Übersetzt</target>');
    });

    it('preserves attributes the named fields do not model', () => {
        const { document, units } = load(LANGUAGE_FILE);
        const unit = units[0];
        const target = required(unit.target, 'a target');

        // A target carrying an attribute we never enumerated (DEC-025).
        unit.target = { ...target, attributes: { ...target.attributes, 'custom-attr': 'keep-me' } };
        const baseline = serialiseXliff(document);

        setTarget(document, baseline, { unitId: unit.id, value: 'Neu' });

        expect(serialiseXliff(document)).toContain('custom-attr="keep-me"');
    });

    it('throws for an unknown unit id', () => {
        const { text, document } = load(LANGUAGE_FILE);
        expect(() => setTarget(document, text, { unitId: 'nope', value: 'x' })).toThrow(XliffParseError);
    });

    it('encodes special characters in the written value', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const edit = required(setTarget(document, text, { unitId: units[2].id, value: 'a & b <c>' }), 'an edit');
        expect(edit.newText).toContain('a &amp; b &lt;c&gt;');
    });

    it('keeps a whitespace-only value rather than treating it as empty', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const edit = required(setTarget(document, text, { unitId: units[4].id, value: ' ' }), 'an edit');

        const result = apply(text, edit);
        expect(result).toContain('> </target>');
        expect(result).toBe(serialiseXliff(document));
    });
});

describe('setState', () => {
    it('changes the state without touching the text', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const unit = units[0];
        const value = unit.target?.value;

        const edit = required(setState(document, text, unit.id, 'needs-review-translation'), 'an edit');
        const result = apply(text, edit);

        expect(unit.target?.value).toBe(value);
        expect(result).toContain('state="needs-review-translation"');
        expect(result).toBe(serialiseXliff(document));
    });

    it('returns null when the state already matches', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        expect(setState(document, text, units[0].id, 'translated')).toBeNull();
    });
});

describe('the round-trip stays green after a write', () => {
    it('a written document re-parses and re-serialises to itself', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const edit = required(setTarget(document, text, { unitId: units[10].id, value: 'Runde zwei' }), 'an edit');
        const written = apply(text, edit);

        expect(serialiseXliff(parseXliff(written))).toBe(written);
    });
});

/**
 * `EDIT-03a`. The field lets a translator press Enter, so a target can hold a real line
 * break. It is worth pinning that one survives: nothing in the corpus has one — AL writes
 * its own line break as a literal backslash inside a single-line string — so no existing
 * test would notice if the write path started normalising or escaping them.
 */
describe('a line break a translator typed', () => {
    const TYPED = 'Erste Zeile\nZweite Zeile';

    it('survives the write, the re-parse and the re-serialise', () => {
        const { text, document, units } = load(LANGUAGE_FILE);
        const written = apply(text, required(setTarget(document, text, { unitId: units[10].id, value: TYPED }), 'an edit'));

        const reparsed = parseXliff(written);
        expect([...iterateUnits(reparsed)].find(unit => unit.id === units[10].id)?.target?.value).toBe(TYPED);
        expect(serialiseXliff(reparsed)).toBe(written);
    });

    it('does not drag the document\'s own line endings along with it', () => {
        // A CRLF document with an LF inside a target: the target keeps what was typed and
        // the file keeps what it had. Mixing the two would rewrite every line.
        const source = read(LANGUAGE_FILE).split('\n').join('\r\n');
        const document = parseXliff(source);
        const units = [...iterateUnits(document)];
        const written = apply(source, required(setTarget(document, source, { unitId: units[10].id, value: TYPED }), 'an edit'));

        expect(written.split('\r\n')).toHaveLength(source.split('\r\n').length);
        expect([...iterateUnits(parseXliff(written))].find(unit => unit.id === units[10].id)?.target?.value).toBe(TYPED);
    });

    it('leaves AL\'s own backslash line break exactly as it found it', () => {
        // `Text.\\` is one line to XML and a line break to AL. It is a character like any
        // other here, and nothing in the write path may treat it as an escape.
        const { text, document, units } = load(LANGUAGE_FILE);
        const written = apply(text, required(setTarget(document, text, { unitId: units[10].id, value: 'Achtung! \\Weiter?' }), 'an edit'));

        expect(written).toContain('>Achtung! \\Weiter?</target>');
        expect([...iterateUnits(parseXliff(written))].find(unit => unit.id === units[10].id)?.target?.value).toBe('Achtung! \\Weiter?');
    });
});

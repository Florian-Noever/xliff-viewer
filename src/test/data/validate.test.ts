import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { XliffParseError } from '../../extension/xliff/errors';
import { validateStructure, validateXml } from '../../extension/xliff/validate';

import type { XliffDocument, XliffFile, XliffGroup, XliffTransUnit } from '../../shared/model';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const read = (name: string): string => readFileSync(`${FIXTURES}/${name}`, 'utf8');

// ── model builders ───────────────────────────────────────────────────────────
function unit(id: string): XliffTransUnit {
    return { attributes: { id }, id, translate: true, source: 's', notes: [] };
}

function group(units: XliffTransUnit[], groups: XliffGroup[] = []): XliffGroup {
    return { attributes: {}, units, groups };
}

function file(units: XliffTransUnit[], groups: XliffGroup[] = []): XliffFile {
    return { attributes: {}, sourceLanguage: 'en-US', body: { attributes: {}, units, groups } };
}

function document(files: XliffFile[]): XliffDocument {
    return {
        attributes: { version: '1.2' },
        version: '1.2',
        files,
        format: { hasBom: false, declaration: '<?xml version="1.0"?>', eol: '\n', hasTrailingNewline: false },
    };
}

// ── malformed fixtures ───────────────────────────────────────────────────────
// Multi-line on purpose: a reported line number is only useful if it can be wrong.
const UNCLOSED_TARGET = `<?xml version="1.0"?>
<xliff version="1.2">
  <file source-language="en">
    <body>
      <trans-unit id="a">
        <source>x</source>
        <target state="translated">y
      </trans-unit>
    </body>
  </file>
</xliff>`;

const MISMATCHED_TAG = `<?xml version="1.0"?>
<xliff version="1.2">
  <file source-language="en">
    <body>
      <trans-unit id="a">
        <source>x</wrong>
      </trans-unit>
    </body>
  </file>
</xliff>`;

const TRUNCATED = `<?xml version="1.0"?>
<xliff version="1.2">
  <file source-language="en">
    <body>
      <trans-unit id="a">
        <source>x`;

const UNQUOTED_ATTRIBUTE = `<?xml version="1.0"?>
<xliff version="1.2">
  <file source-language="en">
    <body>
      <trans-unit id=a>
        <source>x</source>
      </trans-unit>
    </body>
  </file>
</xliff>`;

describe('validateXml', () => {
    it('accepts every file in the corpus', () => {
        const files = readdirSync(FIXTURES);
        expect(files).toHaveLength(7);
        for (const name of files) {
            expect(() => validateXml(read(name)), name).not.toThrow();
        }
    });

    it('accepts the BOM-prefixed base file', () => {
        const text = read('Contoso App.g.xlf');
        expect(text.charCodeAt(0)).toBe(0xfeff);
        expect(() => validateXml(text)).not.toThrow();
    });

    it.each([
        ['an unclosed target', UNCLOSED_TARGET],
        ['a mismatched closing tag', MISMATCHED_TAG],
        ['a truncated document', TRUNCATED],
        ['an unquoted attribute value', UNQUOTED_ATTRIBUTE],
    ])('rejects %s, with a line number', (_label, text) => {
        let caught: XliffParseError | undefined;
        try {
            validateXml(text);
        } catch (error: unknown) {
            caught = error as XliffParseError;
        }

        expect(caught).toBeInstanceOf(XliffParseError);
        expect(caught?.message).toBeTruthy();
        expect(caught?.line).toBeGreaterThan(0);
        expect(caught?.displayMessage).toContain('line');
    });

    it('reports a line inside the document, not always line 1', () => {
        let caught: XliffParseError | undefined;
        try {
            validateXml(MISMATCHED_TAG);
        } catch (error: unknown) {
            caught = error as XliffParseError;
        }
        expect(caught?.line).toBeGreaterThan(1);
    });

});

describe('validateStructure', () => {
    it('accepts a document with unique ids', () => {
        expect(() => validateStructure(document([file([unit('a'), unit('b')])]))).not.toThrow();
    });

    it('rejects a document with no <file>', () => {
        expect(() => validateStructure(document([]))).toThrow(XliffParseError);
        expect(() => validateStructure(document([]))).toThrow(/no <file>/);
    });

    it('rejects two units sharing an id', () => {
        const doc = document([file([unit('dup'), unit('dup')])]);
        expect(() => validateStructure(doc)).toThrow(/Duplicate .*"dup"/);
    });

    it('finds a duplicate across nested groups, not just the top level', () => {
        const doc = document([file([unit('a')], [group([unit('b')], [group([unit('a')])])])]);
        expect(() => validateStructure(doc)).toThrow(/Duplicate .*"a"/);
    });

    it('rejects a unit with an empty id', () => {
        expect(() => validateStructure(document([file([unit('')])]))).toThrow(/no id/);
    });

    it('allows the same id in two different <file> elements', () => {
        // XLIFF 1.2 scopes trans-unit ids to their <file>, so this is legal.
        const doc = document([file([unit('shared')]), file([unit('shared')])]);
        expect(() => validateStructure(doc)).not.toThrow();
    });

    it('names which <file> the problem is in', () => {
        const doc = document([file([unit('a')]), file([unit('b'), unit('b')])]);
        expect(() => validateStructure(doc)).toThrow(/<file> 2/);
    });
});

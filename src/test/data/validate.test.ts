import { describe, expect, it } from 'vitest';

import { XliffParseError } from '../../extension/xliff/errors';
import { validateStructure, validateXml } from '../../extension/xliff/validate';
import { FIXTURE, FIXTURE_NAMES, readFixture } from '../support/fixtures';

import type { XliffDocument, XliffFile, XliffGroup, XliffTransUnit } from '../../shared/model';

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
        expect(FIXTURE_NAMES).toHaveLength(7);
        for (const name of FIXTURE_NAMES) {
            expect(() => validateXml(readFixture(name)), name).not.toThrow();
        }
    });

    it('accepts the BOM-prefixed base file', () => {
        const text = readFixture(FIXTURE.base);
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

    it.each([
        ['text', '<source>a&nbsp;b</source>', 18],
        ['an attribute value', '<source label="a&nbsp;b">s</source>', 25],
    ])('rejects a named entity XML does not define, in %s, where it stands', (_where, source, col) => {
        const text = `<?xml version="1.0"?>\n<xliff version="1.2">\n  <file source-language="en"><body><trans-unit id="a">\n        ${source}\n  </trans-unit></body></file>\n</xliff>`;

        expect(() => validateXml(text)).toThrow(XliffParseError);
        expect(() => validateXml(text)).toThrow('The entity &nbsp; is not part of XML');
        expect(() => validateXml(text)).toThrow(expect.objectContaining({ line: 4, col }));
    });

    it('accepts the five entities XML defines and numeric references', () => {
        expect(() => validateXml('<xliff version="1.2"><file source-language="en"><body><trans-unit id="a"><source>&amp; &lt; &gt; &quot; &apos; &#160; &#xA0;</source></trans-unit></body></file></xliff>')).not.toThrow();
    });

    it.each([
        ['a comment', '<!-- &nbsp; -->'],
        ['a CDATA section', '<source><![CDATA[&nbsp;]]></source>'],
        ['a processing instruction', '<?review &nbsp;?>'],
    ])('leaves an entity-shaped text inside %s alone', (_where, inner) => {
        expect(() => validateXml(`<xliff version="1.2"><file source-language="en"><body><trans-unit id="a">${inner}<source>s</source></trans-unit></body></file></xliff>`)).not.toThrow();
    });

    it('counts lines and columns past a BOM and CRLF line endings', () => {
        const text = '\uFEFF<?xml version="1.0"?>\r\n<xliff version="1.2">\r\n  <file source-language="en"><body><trans-unit id="a"><source>s</source>\r\n  <target>x &bogus;</target></trans-unit></body></file>\r\n</xliff>';

        expect(() => validateXml(text)).toThrow(expect.objectContaining({ line: 4, col: 13 }));
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

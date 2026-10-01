import { describe, expect, it } from 'vitest';

import { parseXliff } from '../../extension/xliff/parser';
import { serialiseXliff } from '../../extension/xliff/serialise';
import { validateStructure } from '../../extension/xliff/validate';

/**
 * Behaviour on input no fixture contains. Some of these pin a loss we would rather not have,
 * so that it stays visible and deliberate.
 */

const wrap = (inner: string): string =>
    `<?xml version="1.0"?>\n<xliff version="1.2">\n  <file source-language="en">\n    <body>\n${inner}\n    </body>\n  </file>\n</xliff>`;

const roundTrip = (text: string): string => serialiseXliff(parseXliff(text));

describe('shapes AL never emits but XLIFF allows', () => {
    it('keeps state-qualifier through a round-trip', () => {
        const text = wrap('      <trans-unit id="a">\n        <source>s</source>\n        <target state="needs-review-translation" state-qualifier="mt-suggestion">t</target>\n      </trans-unit>');
        const unit = parseXliff(text).files[0].body.units[0];

        expect(unit.target?.stateQualifier).toBe('mt-suggestion');
        expect(roundTrip(text)).toContain('state-qualifier="mt-suggestion"');
    });

    it('keeps attributes on <body> and an id-less <group>', () => {
        const text = wrap('      <trans-unit id="a">\n        <source>s</source>\n      </trans-unit>');
        const withBodyAttrs = text.replace('<body>', '<body custom="x">');
        expect(roundTrip(withBodyAttrs)).toContain('<body custom="x">');

        const grouped = wrap('      <group>\n        <trans-unit id="a">\n          <source>s</source>\n        </trans-unit>\n      </group>');
        const document = parseXliff(grouped);
        expect(document.files[0].body.groups[0].id).toBeUndefined();
        expect(roundTrip(grouped)).toContain('<group>');
    });

    it('accepts an empty <body>', () => {
        const text = wrap('');
        expect(() => validateStructure(parseXliff(text))).not.toThrow();
    });

    it('rejects a <file> with no <body> at parse time', () => {
        const text = '<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en"></file></xliff>';
        expect(() => parseXliff(text)).toThrow(/0 <body> elements/);
    });
});

describe('known losses, pinned deliberately', () => {
    it('drops XML comments, so a document with one is read-only', () => {
        const text = wrap('      <!-- reviewed -->\n      <trans-unit id="a">\n        <source>s</source>\n      </trans-unit>');

        // Once comments survive the round-trip, this fails and the document can be writable.
        expect(roundTrip(text)).not.toContain('reviewed');
        expect(parseXliff(text).unsupported).toBe('XML comments');
    });

    it('converts CDATA to escaped text, so a document with any is read-only', () => {
        const text = wrap('      <trans-unit id="a">\n        <source><![CDATA[<b>x</b>]]></source>\n      </trans-unit>');

        expect(parseXliff(text).files[0].body.units[0].source).toBe('<b>x</b>');
        expect(roundTrip(text)).toContain('<source>&lt;b&gt;x&lt;/b&gt;</source>');
        expect(parseXliff(text).unsupported).toBe('a CDATA section');
    });
});

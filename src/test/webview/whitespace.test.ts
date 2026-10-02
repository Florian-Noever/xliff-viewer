import { describe, expect, it } from 'vitest';

import { loadBearingWhitespace, whitespaceParts, WhitespaceReason } from '../../webview/whitespace';

describe('whitespaceParts', () => {
    it.each([
        ['', { lead: '', core: '', trail: '' }],
        ['   ', { lead: '   ', core: '', trail: '' }],
        ['a', { lead: '', core: 'a', trail: '' }],
        [' a', { lead: ' ', core: 'a', trail: '' }],
        ['a ', { lead: '', core: 'a', trail: ' ' }],
        ['\n a b \t', { lead: '\n ', core: 'a b', trail: ' \t' }],
        ['\u00a0x\u3000', { lead: '\u00a0', core: 'x', trail: '\u3000' }],
    ])('splits %j at its edges', (value, parts) => {
        expect(whitespaceParts(value)).toEqual(parts);
    });
});

describe('loadBearingWhitespace', () => {
    it('ignores an absent or empty target', () => {
        expect(loadBearingWhitespace('a', undefined)).toBeUndefined();
        expect(loadBearingWhitespace('a', '')).toBeUndefined();
    });

    it('calls a whitespace-only target out however it is spelt', () => {
        expect(loadBearingWhitespace('a', ' ')).toBe(WhitespaceReason.only);
        expect(loadBearingWhitespace('a', '\t\n')).toBe(WhitespaceReason.only);
    });

    it('compares both edges against the source, not against nothing', () => {
        expect(loadBearingWhitespace('a', ' a')).toBe(WhitespaceReason.edges);
        expect(loadBearingWhitespace('a', 'a ')).toBe(WhitespaceReason.edges);
        expect(loadBearingWhitespace(' a ', ' a ')).toBeUndefined();
        expect(loadBearingWhitespace(' a', 'a')).toBe(WhitespaceReason.edges);
    });

    it('does not care about whitespace in the middle', () => {
        expect(loadBearingWhitespace('a b', 'a  b')).toBeUndefined();
    });
});

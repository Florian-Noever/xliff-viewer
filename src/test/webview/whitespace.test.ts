import { describe, expect, it } from 'vitest';

import { whitespaceParts } from '../../webview/whitespace';

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

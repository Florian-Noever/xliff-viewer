import { describe, expect, it } from 'vitest';

import { escapeRegExp } from '../../shared/escapeRegExp';

describe('escapeRegExp', () => {
    it('makes every metacharacter match itself, and nothing else', () => {
        const metacharacters = '\\^$.|?*+()[]{}';
        const pattern = new RegExp(`^${escapeRegExp(metacharacters)}$`);

        expect(pattern.test(metacharacters)).toBe(true);
        expect(pattern.test('x'.repeat(metacharacters.length))).toBe(false);
    });

    it('leaves ordinary text as it is', () => {
        expect(escapeRegExp('Table 1 - Field "No."')).toBe('Table 1 - Field "No\\."');
    });
});

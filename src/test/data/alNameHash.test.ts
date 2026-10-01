import { describe, expect, it } from 'vitest';

import { alNameHash } from '../../extension/xliff/alNameHash';

describe('alNameHash', () => {
    it.each([
        ['Caption', '2879900210'],
        ['ToolTip', '1295455071'],
        ['OptionCaption', '62802879'],
    ])('writes %s as %s, the number AL writes for it', (name, hash) => {
        expect(alNameHash(name)).toBe(hash);
    });

    it('hashes the empty name to the bare offset', () => {
        expect(alNameHash('')).toBe('18652612');
    });

    it('hashes a Latin-1 name', () => {
        expect(alNameHash('Größe')).toBe('1085276355');
    });

    // Each code unit is two bytes, and these have a high byte that is not zero.
    it.each([
        ['€', '143838320'],
        ['Kosten in €', '3112713173'],
        ['中文', '3377253005'],
        ['😀', '860495273'],
    ])('hashes both bytes of every code unit in %s', (name, hash) => {
        expect(alNameHash(name)).toBe(hash);
    });

    it('is case-sensitive, because AL hashes a name as it is declared', () => {
        expect(alNameHash('caption')).toBe('3830149458');
        expect(alNameHash('caption')).not.toBe(alNameHash('Caption'));
    });

    it('stays within the range AL writes', () => {
        for (const name of ['a', 'Sales - Quote', 'Contoso.Sales', 'No.', '12345', ' ']) {
            const hash = Number(alNameHash(name));
            expect(Number.isInteger(hash), name).toBe(true);
            expect(hash, name).toBeGreaterThanOrEqual(-1);
            expect(hash, name).toBeLessThanOrEqual(4294967294);
        }
    });
});

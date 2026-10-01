import { describe, expect, it } from 'vitest';

import { PreprocessorState } from '../../extension/al/alDirectives';

describe('PreprocessorState', () => {
    const state = (...symbols: string[]) => new PreprocessorState(symbols);
    const activeAfter = (lines: readonly string[], symbols: readonly string[] = []) => {
        const preprocessor = new PreprocessorState(symbols);
        return lines.map((line) => {
            preprocessor.apply(line);
            return preprocessor.active;
        });
    };

    it('takes the branch whose condition holds', () => {
        expect(activeAfter(['if CLEAN', 'else', 'endif'], ['CLEAN'])).toEqual([true, false, true]);
        expect(activeAfter(['if CLEAN', 'else', 'endif'])).toEqual([false, true, true]);
    });

    it('takes the first #elif that holds, and no later one', () => {
        expect(activeAfter(['if A', 'elif B', 'elif C', 'else', 'endif'], ['B', 'C'])).toEqual([false, true, false, false, true]);
    });

    it('reads not, and, or and parentheses, in that order of strength', () => {
        const holds = (expression: string, ...symbols: string[]) => {
            const preprocessor = state(...symbols);
            preprocessor.apply(`if ${expression}`);
            return preprocessor.active;
        };

        expect(holds('not A')).toBe(true);
        expect(holds('A and not B', 'A')).toBe(true);
        expect(holds('A or B and C', 'A')).toBe(true);
        expect(holds('(A or B) and C', 'A')).toBe(false);
    });

    it('compares symbols exactly, as the compiler does', () => {
        expect(activeAfter(['if CLEAN'], ['Clean'])).toEqual([false]);
        expect(activeAfter(['if Clean'], ['Clean'])).toEqual([true]);
    });

    it('reads true and false as values, not symbols', () => {
        expect(activeAfter(['if true', 'endif', 'if false', 'endif', 'if not false'], [])).toEqual([true, true, false, true, true]);
    });

    it('compares with = and <>, below not and above and', () => {
        expect(activeAfter(['if A = B', 'endif', 'if A <> B', 'endif', 'if A=B'], ['A'])).toEqual([false, true, true, true, false]);
        expect(activeAfter(['if not A = B'], ['A'])).toEqual([true]);
        expect(activeAfter(['if A = B and C'], ['C'])).toEqual([true]);
    });

    it('reads a condition nested past any real depth as one it cannot parse, without throwing', () => {
        expect(() => activeAfter([`if ${'('.repeat(100000)}A`, 'endif', `if ${'not '.repeat(100000)}A`], [])).not.toThrow();
        expect(activeAfter([`if ${'('.repeat(100000)}A`], [])).toEqual([true]);
    });

    it('keeps a nested #if off when its parent is off, whatever its own condition', () => {
        expect(activeAfter(['if A', 'if B', 'endif', 'endif'], ['B'])).toEqual([false, false, false, true]);
    });

    it('reads the first branch of a condition it cannot parse', () => {
        expect(activeAfter(['if A &&', 'else', 'endif'])).toEqual([true, false, true]);
    });

    it('defines and undefines symbols for what follows', () => {
        expect(activeAfter(['define LOCAL', 'if LOCAL', 'endif', 'undef LOCAL', 'if LOCAL', 'endif'])).toEqual([true, true, true, true, false, true]);
    });

    it('ignores regions, pragmas and a trailing comment', () => {
        expect(activeAfter(['region Anything', 'pragma warning disable AA0001', 'endregion', 'if A // a comment', 'endif'], ['A']))
            .toEqual([true, true, true, true, true]);
    });
});

import { describe, expect, it } from 'vitest';

import { PreprocessorState } from '../../extension/al/alDirectives';
import { AlTokenKind, tokenizeAl } from '../../extension/al/alLexer';

const values = (text: string, symbols: readonly string[] = []) => tokenizeAl(text, symbols).map(token => token.value);

describe('tokenizeAl', () => {
    it('reads identifiers, quoted names, strings, numbers and punctuation', () => {
        const tokens = tokenizeAl('field(1; "No."; Code[20]) { Caption = \'No.\'; }');

        expect(tokens.map(token => [token.kind, token.value])).toEqual([
            [AlTokenKind.identifier, 'field'], [AlTokenKind.punctuation, '('], [AlTokenKind.number, '1'],
            [AlTokenKind.punctuation, ';'], [AlTokenKind.quoted, 'No.'], [AlTokenKind.punctuation, ';'],
            [AlTokenKind.identifier, 'Code'], [AlTokenKind.punctuation, '['], [AlTokenKind.number, '20'],
            [AlTokenKind.punctuation, ']'], [AlTokenKind.punctuation, ')'], [AlTokenKind.punctuation, '{'],
            [AlTokenKind.identifier, 'Caption'], [AlTokenKind.punctuation, '='], [AlTokenKind.string, 'No.'],
            [AlTokenKind.punctuation, ';'], [AlTokenKind.punctuation, '}'],
        ]);
    });

    it('gives each token the offsets of the text it came from, quotes included', () => {
        const text = 'x "A ""B""" \'c\'\'d\'';
        const tokens = tokenizeAl(text);

        expect(tokens.map(token => text.slice(token.start, token.end))).toEqual(['x', '"A ""B"""', '\'c\'\'d\'']);
        expect(tokens.map(token => token.value)).toEqual(['x', 'A "B"', 'c\'d']);
    });

    it('reads a brace inside a string or a comment as text, not structure', () => {
        expect(values('a \'{\' /* { */ b // }\n c')).toEqual(['a', '{', 'b', 'c']);
        expect(tokenizeAl('\'{\'')[0].kind).toBe(AlTokenKind.string);
    });

    it('reads non-ASCII identifiers whole', () => {
        expect(values('field(3; Größe; Decimal)')).toContain('Größe');
    });

    it('keeps two-character operators together, and a range apart from its numbers', () => {
        expect(values('x := 1..10; Enum::Open <> y')).toEqual(['x', ':=', '1', '..', '10', ';', 'Enum', '::', 'Open', '<>', 'y']);
        expect(values('1.5')).toEqual(['1.5']);
    });

    it('ends a string that is never closed at its line, so it cannot swallow the file', () => {
        expect(values('Caption = \'open\n}')).toEqual(['Caption', '=', 'open', '}']);
        expect(values('"open\n}')).toEqual(['open', '}']);
    });

    it('ends an unclosed block comment at the end of the text', () => {
        expect(values('a /* b\n c')).toEqual(['a']);
    });

    it('gives exact offsets in CRLF text', () => {
        const text = 'table 1 X\r\n{\r\n    Caption = \'X\';\r\n}\r\n';
        const caption = tokenizeAl(text).find(token => token.value === 'Caption');

        expect(caption === undefined ? undefined : text.slice(caption.start, caption.end)).toBe('Caption');
    });

    it('reads nothing on the lines the preprocessor switches off', () => {
        const text = '#if CLEAN\nkept\n#else\ndropped\n#endif\nafter';

        expect(values(text, ['CLEAN'])).toEqual(['kept', 'after']);
        expect(values(text)).toEqual(['dropped', 'after']);
    });

    it('reads an indented directive as a directive, and a # inside a string as text', () => {
        expect(values('    #if CLEAN\nkept\n    #endif', ['CLEAN'])).toEqual(['kept']);
        expect(values('\'#if\'')).toEqual(['#if']);
    });

    it('never throws, whatever it is given', () => {
        for (const text of ['', '"', '\'', '/*', '#if', '#endif\n#else', '((((', '}}}}', '\u0000', 'ä"ö\'ü']) {
            expect(() => tokenizeAl(text), JSON.stringify(text)).not.toThrow();
        }
    });
});

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

    it('compares symbols ignoring case', () => {
        const preprocessor = state('Clean');
        preprocessor.apply('if CLEAN');
        expect(preprocessor.active).toBe(true);
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

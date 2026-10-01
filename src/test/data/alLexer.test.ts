import { describe, expect, it } from 'vitest';

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

    it('reads a name written with combining marks whole', () => {
        const decomposed = 'Gro\u0308\u00dfe';

        expect(values(`field(3; ${decomposed}; Decimal)`)).toContain(decomposed);
    });

    it('reads a verbatim string as one token, across lines, braces and directives', () => {
        const text = "x := @'first {\n#if X\nit''s }';\ny";

        expect(values(text)).toEqual(['x', ':=', "first {\n#if X\nit's }", ';', 'y']);
        expect(tokenizeAl(text)[2].kind).toBe(AlTokenKind.string);
    });

    it('ends an unclosed verbatim string at the end of the text', () => {
        expect(values("a @'b\n}\n{")).toEqual(['a', 'b\n}\n{']);
    });

    it('ends a line at a carriage return alone, as the compiler does', () => {
        expect(values('// c\rtable 1 X\r{\r}')).toEqual(['table', '1', 'X', '{', '}']);
        expect(values('#if A\rkept\r#else\rdropped\r#endif', ['A'])).toEqual(['kept']);
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

    it('evaluates a directive in CRLF text, arguments and all', () => {
        expect(values('#if CLEAN\r\nkept\r\n#else\r\ndropped\r\n#endif\r\nafter', ['CLEAN'])).toEqual(['kept', 'after']);
        expect(values('#define X\r\n#if X\r\nkept\r\n#endif')).toEqual(['kept']);
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


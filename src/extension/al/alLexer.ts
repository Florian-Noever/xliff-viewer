import { PreprocessorState } from './alDirectives';

/**
 * AL source as tokens, with offsets into the text.
 *
 * Only what the outline needs: comments are dropped, strings and quoted names are read as
 * one token each — so a brace inside either is never structure — and lines the
 * preprocessor switches off produce nothing. Never throws: a string or a quoted name that is
 * not closed ends at its line, and a verbatim string or a comment that is not closed ends
 * the text. A line ends at any of the line breaks the compiler knows, CR alone included.
 */

export const AlTokenKind = {
    identifier: 'identifier',
    quoted: 'quoted',
    string: 'string',
    number: 'number',
    punctuation: 'punctuation',
} as const;
export type AlTokenKind = typeof AlTokenKind[keyof typeof AlTokenKind];

export interface AlToken {
    readonly kind: AlTokenKind;
    /** Offset of the first character, quotes included. */
    readonly start: number;
    /** Offset just past the last character. */
    readonly end: number;
    /** An identifier or number as written, a quoted name or string unquoted, or the punctuation. */
    readonly value: string;
}

/** A letter or `_`, then letters, digits, combining marks, connectors and format characters. */
const IDENTIFIER = /[\p{L}_][\p{L}\p{M}\p{N}\p{Pc}\p{Cf}]*/uy;
const NUMBER = /\d+(?:\.\d+)?/y;
const TWO_CHARACTER = new Set([':=', '::', '..', '<=', '>=', '<>', '+=', '-=', '*=', '/=']);
const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/g;

function isLineBreak(code: number): boolean {
    return code === 0x0a || code === 0x0d || code === 0x85 || code === 0x2028 || code === 0x2029;
}

/** Where the line `from` is on ends: at its first line break, or at the end of the text. */
function lineEnd(text: string, from: number): number {
    LINE_BREAK.lastIndex = from;
    return LINE_BREAK.exec(text)?.index ?? text.length;
}

/** Reads a `'…'` string or a `"…"` name, a doubled quote standing for one, ending at its line. */
function readQuoted(text: string, start: number, quote: string): { readonly end: number; readonly value: string } {
    let value = '';
    let index = start + 1;
    while (index < text.length) {
        const character = text[index];
        if (character === quote) {
            if (text[index + 1] === quote) {
                value += quote;
                index += 2;
                continue;
            }
            return { end: index + 1, value };
        }
        if (isLineBreak(text.charCodeAt(index))) {
            break;
        }
        value += character;
        index++;
    }
    return { end: index, value };
}

/** Reads an `@'…'` string, which may span lines; a doubled quote stands for one. */
function readVerbatim(text: string, start: number): { readonly end: number; readonly value: string } {
    let value = '';
    let index = start + 2;
    while (index < text.length) {
        if (text[index] === '\'') {
            if (text[index + 1] !== '\'') {
                return { end: index + 1, value };
            }
            index++;
        }
        value += text[index];
        index++;
    }
    return { end: text.length, value };
}

/** Tokenises AL source; `symbols` are the preprocessor symbols the app defines. */
export function tokenizeAl(text: string, symbols: Iterable<string> = []): AlToken[] {
    const tokens: AlToken[] = [];
    const preprocessor = new PreprocessorState(symbols);
    let index = 0;
    let lineStart = true;

    while (index < text.length) {
        const code = text.charCodeAt(index);

        if (isLineBreak(code)) {
            index++;
            lineStart = true;
            continue;
        }
        if (code <= 32 || code === 0xa0 || code === 0xfeff) {
            index++;
            continue;
        }
        if (lineStart && code === 35 /* # */) {
            const end = lineEnd(text, index);
            preprocessor.apply(text.slice(index + 1, end));
            index = end;
            continue;
        }
        lineStart = false;

        if (!preprocessor.active) {
            index = lineEnd(text, index);
            continue;
        }
        if (text.startsWith('//', index)) {
            index = lineEnd(text, index);
            continue;
        }
        if (text.startsWith('/*', index)) {
            const close = text.indexOf('*/', index + 2);
            index = close < 0 ? text.length : close + 2;
            continue;
        }

        const character = text[index];
        if (character === '@' && text[index + 1] === '\'') {
            const { end, value } = readVerbatim(text, index);
            tokens.push({ kind: AlTokenKind.string, start: index, end, value });
            index = end;
            continue;
        }
        if (character === '\'' || character === '"') {
            const { end, value } = readQuoted(text, index, character);
            tokens.push({ kind: character === '"' ? AlTokenKind.quoted : AlTokenKind.string, start: index, end, value });
            index = end;
            continue;
        }

        IDENTIFIER.lastIndex = index;
        const identifier = IDENTIFIER.exec(text);
        if (identifier !== null) {
            tokens.push({ kind: AlTokenKind.identifier, start: index, end: index + identifier[0].length, value: identifier[0] });
            index += identifier[0].length;
            continue;
        }

        NUMBER.lastIndex = index;
        const number = NUMBER.exec(text);
        if (number !== null) {
            tokens.push({ kind: AlTokenKind.number, start: index, end: index + number[0].length, value: number[0] });
            index += number[0].length;
            continue;
        }

        const pair = text.slice(index, index + 2);
        const width = TWO_CHARACTER.has(pair) ? 2 : 1;
        tokens.push({ kind: AlTokenKind.punctuation, start: index, end: index + width, value: text.slice(index, index + width) });
        index += width;
    }

    return tokens;
}

import { AlTokenKind, tokenizeAl } from './alLexer';
import { isTransparentKeyword } from './alSymbolKinds';

import type { AlToken } from './alLexer';

/**
 * The declarations in an AL file, with where each one is — and nothing else.
 *
 * Objects, the sections and members inside them, methods, `var` sections, properties and
 * report labels. No expression, type or binding is read: a method's body is skipped by
 * counting `begin` and `case` against `end`, and a property's value by finding its `;`.
 * Tolerant by design — an unknown construct is stepped over, a missing brace ends a block at
 * the next one, and nothing throws: blocks nested deeper than any real source are skipped
 * whole rather than read.
 */

export interface AlRange {
    readonly start: number;
    readonly end: number;
}

/** A declared name, unquoted, with the range of the token that declares it. */
export interface AlName {
    readonly text: string;
    readonly range: AlRange;
}

/** `Caption = '…';` — and, in a report's `labels` section, `NameLbl = '…';`. */
export interface AlProperty {
    readonly name: AlName;
    /** From the name to the closing `;`. */
    readonly range: AlRange;
}

export interface AlVariable {
    readonly name: AlName;
    /** The type's first word, lowercased: `label`, `textconst`, `record`, … */
    readonly type: string;
    /** From the name to the closing `;`. */
    readonly range: AlRange;
}

export const AlDeclarationKind = {
    object: 'object',
    section: 'section',
    member: 'member',
    method: 'method',
} as const;
export type AlDeclarationKind = typeof AlDeclarationKind[keyof typeof AlDeclarationKind];

export interface AlDeclaration {
    readonly kind: AlDeclarationKind;
    /** The keyword that opens it, lowercased: `table`, `fields`, `field`, `trigger`, … */
    readonly keyword: string;
    readonly name?: AlName;
    /** From the keyword to the closing brace, or to the `end;` of a method. */
    readonly range: AlRange;
    /** The section it sits in, lowercased and inherited through members: `layout`, `actions`, … */
    readonly section?: string;
    readonly children: readonly AlDeclaration[];
    readonly properties: readonly AlProperty[];
    readonly variables: readonly AlVariable[];
}

export interface AlObject extends AlDeclaration {
    readonly id?: number;
    /** The file's namespace, qualified: `Contoso.Sales`. */
    readonly namespace?: string;
    /** What an extension or a customization extends, without the target's namespace. */
    readonly target?: AlName;
}

export interface AlOutline {
    readonly namespace?: AlName;
    readonly objects: readonly AlObject[];
}

interface Building {
    kind: AlDeclarationKind;
    keyword: string;
    name?: AlName;
    range: AlRange;
    section?: string;
    children: Building[];
    properties: AlProperty[];
    variables: AlVariable[];
    id?: number;
    namespace?: string;
    target?: AlName;
}

const OBJECT_KEYWORDS = new Set([
    'table', 'tableextension', 'page', 'pageextension', 'pagecustomization', 'report', 'reportextension',
    'codeunit', 'xmlport', 'query', 'enum', 'enumextension', 'interface', 'controladdin', 'profile',
    'profileextension', 'permissionset', 'permissionsetextension', 'entitlement', 'dotnet',
]);
const METHOD_KEYWORDS = new Set(['procedure', 'trigger', 'event']);
const MODIFIERS = new Set(['local', 'internal', 'protected']);
const OPENERS = new Set(['(', '[']);
const CLOSERS = new Set([')', ']']);
/** Deeper than any real AL; below it, a block is skipped rather than read. */
const MAX_DEPTH = 100;

/** Reads every declaration in the text; `symbols` are the app's preprocessor symbols. */
export function outlineAl(text: string, symbols: Iterable<string> = []): AlOutline {
    return new OutlineReader(tokenizeAl(text, symbols), false).read();
}

/** Reads only the objects' headers — kind, number, name, namespace, target — skipping bodies. */
export function scanHeaders(text: string, symbols: Iterable<string> = []): AlOutline {
    return new OutlineReader(tokenizeAl(text, symbols), true).read();
}

class OutlineReader {
    private readonly tokens: readonly AlToken[];
    private readonly headersOnly: boolean;
    /** What `current()` answers past the last token, so no caller needs to ask. */
    private readonly past: AlToken;
    private index = 0;

    public constructor(tokens: readonly AlToken[], headersOnly: boolean) {
        this.tokens = tokens;
        this.headersOnly = headersOnly;
        const end = tokens.at(-1)?.end ?? 0;
        this.past = { kind: AlTokenKind.punctuation, start: end, end, value: '' };
    }

    public read(): AlOutline {
        let namespace: AlName | undefined;
        const objects: Building[] = [];

        while (this.index < this.tokens.length) {
            const word = this.word();
            if (word === 'namespace') {
                this.index++;
                namespace = this.readQualifiedName()?.full;
                this.skipPast(';');
            } else if (word === 'using') {
                this.skipPast(';');
            } else if (word !== undefined && OBJECT_KEYWORDS.has(word)) {
                objects.push(this.readObject(word, namespace?.text));
            } else if (this.is('{')) {
                this.skipBlock();
            } else {
                this.index++;
            }
        }

        return namespace === undefined ? { objects } : { namespace, objects };
    }

    private readObject(keyword: string, namespace: string | undefined): Building {
        const start = this.current().start;
        this.index++;

        const object = this.declaration(AlDeclarationKind.object, keyword, start);
        if (namespace !== undefined) {
            object.namespace = namespace;
        }
        if (this.current().kind === AlTokenKind.number) {
            object.id = Number.parseInt(this.current().value, 10);
            this.index++;
        }
        if (this.isName() && !['extends', 'implements', 'customizes'].includes(this.word() ?? '')) {
            object.name = this.nameOf(this.current());
            this.index++;
        }

        while (this.index < this.tokens.length && !this.is('{')) {
            const word = this.word();
            this.index++;
            if (word === 'extends' || word === 'customizes') {
                const target = this.readQualifiedName();
                if (target !== undefined) {
                    object.target = target.last;
                }
            }
        }

        object.range = { start, end: this.headersOnly ? this.skipBlock() : this.readBody(object, undefined, 0) };
        return object;
    }

    /** Reads `{ … }` into `into`, returning the offset just past the closing brace. */
    private readBody(into: Building, section: string | undefined, depth: number): number {
        if (!this.is('{')) {
            return this.lastEnd();
        }
        if (depth > MAX_DEPTH) {
            return this.skipBlock();
        }
        this.index++;

        while (this.index < this.tokens.length) {
            const token = this.current();
            if (this.is('}')) {
                this.index++;
                return token.end;
            }
            if (this.is('[')) {
                this.skipBalanced();
                continue;
            }

            const word = this.word();
            const next = this.peek(1);
            if (word !== undefined && MODIFIERS.has(word)) {
                this.index++;
            } else if (word !== undefined && METHOD_KEYWORDS.has(word)) {
                into.children.push(this.readMethod(word, section));
            } else if (word === 'var') {
                this.readVariables(into.variables);
            } else if (this.isName() && next.kind === AlTokenKind.punctuation && next.value === '=') {
                into.properties.push(this.readProperty());
            } else if (word !== undefined && next.kind === AlTokenKind.punctuation && next.value === '{') {
                // `addfirst { … }` without an anchor adds to the section it sits in, so it
                // keeps that section rather than naming one.
                const inner = isTransparentKeyword(word) ? section : word;
                const child = this.declaration(AlDeclarationKind.section, word, token.start, inner);
                this.index++;
                child.range = { start: token.start, end: this.readBody(child, inner, depth + 1) };
                into.children.push(child);
            } else if (section === 'labels' && word === 'label' && next.kind === AlTokenKind.punctuation && next.value === '(') {
                into.properties.push(this.readLabel());
            } else if (word !== undefined && next.kind === AlTokenKind.punctuation && next.value === '(') {
                into.children.push(this.readMember(word, section, depth));
            } else {
                this.index++;
            }
        }

        return this.lastEnd();
    }

    /** A report label in its multilanguage form, `label(Name; ENU = '…', DEU = '…')`, read as `Name = '…';`. */
    private readLabel(): AlProperty {
        const keyword = this.current();
        this.index++;
        const name = this.readArguments().find(argument => argument.length === 1
            && (argument[0].kind === AlTokenKind.identifier || argument[0].kind === AlTokenKind.quoted));
        if (this.is(';')) {
            this.index++;
        }
        return { name: this.nameOf(name?.[0] ?? keyword), range: { start: keyword.start, end: this.lastEnd() } };
    }

    /** `field(1; "No."; Code[20]) { … }` — named by its first argument that is a name. */
    private readMember(keyword: string, section: string | undefined, depth: number): Building {
        const start = this.current().start;
        this.index++;

        const member = this.declaration(AlDeclarationKind.member, keyword, start, section);
        const name = this.readArguments().find(argument => argument.length === 1
            && (argument[0].kind === AlTokenKind.identifier || argument[0].kind === AlTokenKind.quoted));
        if (name !== undefined) {
            member.name = this.nameOf(name[0]);
        }

        if (this.is('{')) {
            member.range = { start, end: this.readBody(member, section, depth + 1) };
        } else {
            if (this.is(';')) {
                this.index++;
            }
            member.range = { start, end: this.lastEnd() };
        }
        return member;
    }

    /** `(a; b, c)` → its top-level arguments, stopping short of a brace if `)` is missing. */
    private readArguments(): AlToken[][] {
        const list: AlToken[][] = [];
        if (!this.is('(')) {
            return list;
        }
        this.index++;

        let current: AlToken[] = [];
        let depth = 0;
        while (this.index < this.tokens.length) {
            const token = this.current();
            if (depth === 0 && (this.is(')') || this.is('{') || this.is('}'))) {
                if (this.is(')')) {
                    this.index++;
                }
                break;
            }
            if (depth === 0 && (this.is(';') || this.is(','))) {
                list.push(current);
                current = [];
            } else {
                if (token.kind === AlTokenKind.punctuation && OPENERS.has(token.value)) {
                    depth++;
                } else if (token.kind === AlTokenKind.punctuation && CLOSERS.has(token.value)) {
                    depth = Math.max(0, depth - 1);
                }
                current.push(token);
            }
            this.index++;
        }
        list.push(current);
        return list;
    }

    /** `procedure Name(…): Type var … begin … end;` — or no body, in an interface. */
    private readMethod(keyword: string, section: string | undefined): Building {
        const start = this.current().start;
        this.index++;

        const method = this.declaration(AlDeclarationKind.method, keyword, start, section);
        if (this.isName()) {
            method.name = this.nameOf(this.current());
            this.index++;
        }
        if (this.is('(')) {
            this.skipBalanced();
        }

        // The return type, up to the body, the local variables — or the next declaration,
        // when there is no body.
        let hasBody = false;
        while (this.index < this.tokens.length) {
            const word = this.word();
            if (word === 'var' || word === 'begin') {
                hasBody = true;
                break;
            }
            if (this.is(';')) {
                this.index++;
                const after = this.word();
                hasBody = after === 'var' || after === 'begin';
                break;
            }
            // A bracket here belongs to the return type — `Code[20]`, `List of [Text]`.
            if (this.is('[')) {
                this.skipBalanced();
                continue;
            }
            if (this.is('{') || this.is('}') || (word !== undefined && (METHOD_KEYWORDS.has(word) || MODIFIERS.has(word)))) {
                break;
            }
            this.index++;
        }

        if (hasBody && this.word() === 'var') {
            this.readVariables(method.variables);
        }
        if (hasBody && this.word() === 'begin') {
            this.skipCode();
            if (this.is(';')) {
                this.index++;
            }
        }
        method.range = { start, end: this.lastEnd() };
        return method;
    }

    /** `var A: Integer; NameLbl: Label '…', Comment = '…';` — stopping at the first thing that is not one. */
    private readVariables(into: AlVariable[]): void {
        this.index++;

        while (this.index < this.tokens.length) {
            const restart = this.index;
            // `[InDataSet]`, `[SecurityFiltering(…)]` — attributes belong to the variable.
            while (this.is('[')) {
                this.skipBalanced();
            }
            const names: AlToken[] = [];
            while (this.isName()) {
                names.push(this.current());
                this.index++;
                if (!this.is(',')) {
                    break;
                }
                this.index++;
            }
            if (names.length === 0 || !this.is(':')) {
                this.index = restart;
                return;
            }
            this.index++;

            const type = this.current().value.toLowerCase();
            const end = this.skipStatement();
            for (const name of names) {
                into.push({ name: this.nameOf(name), type, range: { start: name.start, end } });
            }
        }
    }

    private readProperty(): AlProperty {
        const name = this.current();
        this.index += 2;
        const end = this.skipStatement();
        return { name: this.nameOf(name), range: { start: name.start, end } };
    }

    /** `Contoso.Sales` or `Microsoft.Sales.Customer."Customer Card"`. */
    private readQualifiedName(): { readonly full: AlName; readonly last: AlName } | undefined {
        if (!this.isName()) {
            return undefined;
        }
        const first = this.current();
        const parts = [first.value];
        let last = first;
        this.index++;
        while (this.is('.') && this.tokens[this.index + 1] !== undefined && this.isName(this.index + 1)) {
            last = this.tokens[this.index + 1];
            parts.push(last.value);
            this.index += 2;
        }
        return {
            full: { text: parts.join('.'), range: { start: first.start, end: last.end } },
            last: this.nameOf(last),
        };
    }

    /** Past the next `;` outside brackets; a stray `}` ends the statement without being taken. */
    private skipStatement(): number {
        let depth = 0;
        while (this.index < this.tokens.length) {
            const token = this.current();
            if (token.kind === AlTokenKind.punctuation) {
                if (OPENERS.has(token.value)) {
                    depth++;
                } else if (CLOSERS.has(token.value)) {
                    depth = Math.max(0, depth - 1);
                } else if (depth === 0 && token.value === ';') {
                    this.index++;
                    return token.end;
                } else if (depth === 0 && (token.value === '}' || token.value === '{')) {
                    return this.lastEnd();
                }
            }
            this.index++;
        }
        return this.lastEnd();
    }

    /** From `begin` to its `end`; `case` opens a level too. A stray `}` ends it, untaken. */
    private skipCode(): void {
        let depth = 0;
        while (this.index < this.tokens.length) {
            const word = this.word();
            if (this.is('}')) {
                return;
            }
            if (word === 'begin' || word === 'case') {
                depth++;
            } else if (word === 'end') {
                depth--;
                if (depth <= 0) {
                    this.index++;
                    return;
                }
            }
            this.index++;
        }
    }

    /** Past a `(…)` or `[…]`, however nested. */
    private skipBalanced(): void {
        let depth = 0;
        while (this.index < this.tokens.length) {
            const token = this.current();
            if (token.kind === AlTokenKind.punctuation && OPENERS.has(token.value)) {
                depth++;
            } else if (token.kind === AlTokenKind.punctuation && CLOSERS.has(token.value)) {
                depth--;
            }
            this.index++;
            if (depth <= 0) {
                return;
            }
        }
    }

    /** Past a `{…}`, however nested, returning the offset after its closing brace. */
    private skipBlock(): number {
        let depth = 0;
        while (this.index < this.tokens.length) {
            const token = this.current();
            this.index++;
            if (token.kind === AlTokenKind.punctuation && token.value === '{') {
                depth++;
            } else if (token.kind === AlTokenKind.punctuation && token.value === '}') {
                depth--;
                if (depth <= 0) {
                    return token.end;
                }
            }
        }
        return this.lastEnd();
    }

    private skipPast(value: string): void {
        while (this.index < this.tokens.length) {
            const found = this.is(value);
            this.index++;
            if (found) {
                return;
            }
        }
    }

    private declaration(kind: AlDeclarationKind, keyword: string, start: number, section?: string): Building {
        const declaration: Building = { kind, keyword, range: { start, end: start }, children: [], properties: [], variables: [] };
        if (section !== undefined) {
            declaration.section = section;
        }
        return declaration;
    }

    private nameOf(token: AlToken): AlName {
        return { text: token.value, range: { start: token.start, end: token.end } };
    }

    private current(): AlToken {
        return this.peek(0);
    }

    /** The token `offset` places on, or an empty one past the end. */
    private peek(offset: number): AlToken {
        return this.tokens.at(this.index + offset) ?? this.past;
    }

    /** The current token as a lowercased keyword, when it is an identifier. */
    private word(): string | undefined {
        const token = this.current();
        return token.kind === AlTokenKind.identifier ? token.value.toLowerCase() : undefined;
    }

    private is(punctuation: string): boolean {
        const token = this.current();
        return token.kind === AlTokenKind.punctuation && token.value === punctuation;
    }

    private isName(at = this.index): boolean {
        const token = this.tokens.at(at) ?? this.past;
        return token.kind === AlTokenKind.identifier || token.kind === AlTokenKind.quoted;
    }

    /** The end of the token before the current one — where a declaration cut short ends. */
    private lastEnd(): number {
        return this.tokens[Math.min(this.index, this.tokens.length) - 1]?.end ?? 0;
    }
}

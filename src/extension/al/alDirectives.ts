/**
 * AL's preprocessor: `#if` / `#elif` / `#else` / `#endif`, `#define` and `#undef`.
 *
 * Evaluated rather than stripped: source commonly holds both branches of an `#if`, and
 * reading both would put two declarations where the compiler sees one — and unbalance the
 * braces when the branches differ. Symbols come from `app.json`'s `preprocessorSymbols` and
 * are compared exactly, as the compiler compares them. `#region`, `#pragma` and anything
 * unknown change nothing.
 */

/** Deeper than any real expression; beyond it, an expression counts as unreadable. */
const MAX_NESTING = 64;

interface Branch {
    /** Whether the enclosing code is live at all. */
    readonly parentActive: boolean;
    /** Whether some branch of this `#if` has already been taken. */
    taken: boolean;
    active: boolean;
}

export class PreprocessorState {
    private readonly symbols: Set<string>;
    private readonly stack: Branch[] = [];

    public constructor(symbols: Iterable<string>) {
        this.symbols = new Set(symbols);
    }

    /** Whether code at this point is compiled. */
    public get active(): boolean {
        return this.stack.at(-1)?.active ?? true;
    }

    /** Applies one directive line, given without its leading `#`. */
    public apply(line: string): void {
        // `s`: a line is read in one pass whatever it holds, never by backtracking.
        const match = /^\s*([A-Za-z]+)\s*(.*)$/s.exec(line.replace(/\/\/.*$/s, ''));
        if (match === null) {
            return;
        }
        const argument = match[2].trim();
        const top = this.stack.at(-1);

        switch (match[1].toLowerCase()) {
            case 'if': {
                const parentActive = this.active;
                const value = parentActive && this.evaluate(argument);
                this.stack.push({ parentActive, taken: value, active: value });
                break;
            }
            case 'elif':
                if (top !== undefined) {
                    top.active = top.parentActive && !top.taken && this.evaluate(argument);
                    top.taken ||= top.active;
                }
                break;
            case 'else':
                if (top !== undefined) {
                    top.active = top.parentActive && !top.taken;
                    top.taken = true;
                }
                break;
            case 'endif':
                this.stack.pop();
                break;
            case 'define':
                if (this.active && argument !== '') {
                    this.symbols.add(argument);
                }
                break;
            case 'undef':
                if (this.active) {
                    this.symbols.delete(argument);
                }
                break;
            default:
                break;
        }
    }

    /**
     * `not`, `=`, `<>`, `and`, `or`, parentheses, `true` and `false` over symbols, in
     * that order of precedence. An expression that cannot be read counts as true, so the first
     * branch is the one read — a guess, but a consistent one.
     */
    private evaluate(expression: string): boolean {
        const words = expression.match(/<>|[()=]|[^\s()=<>]+/g) ?? [];
        let position = 0;
        let depth = 0;
        const peek = (): string | undefined => words[position]?.toLowerCase();
        const nested = (read: () => boolean | undefined): boolean | undefined => {
            if (depth >= MAX_NESTING) {
                return undefined;
            }
            depth++;
            const value = read();
            depth--;
            return value;
        };

        const primary = (): boolean | undefined => {
            const word = peek();
            if (word === '(') {
                position++;
                const value = nested(or);
                if (peek() !== ')') {
                    return undefined;
                }
                position++;
                return value;
            }
            if (word === undefined || word === ')' || word === '=' || word === '<>' || word === 'and' || word === 'or' || word === 'not') {
                return undefined;
            }
            const symbol = words[position];
            position++;
            return word === 'true' || word === 'false' ? word === 'true' : this.symbols.has(symbol);
        };
        const not = (): boolean | undefined => {
            if (peek() === 'not') {
                position++;
                const value = nested(not);
                return value === undefined ? undefined : !value;
            }
            return primary();
        };
        const equality = (): boolean | undefined => {
            let value = not();
            while (value !== undefined && (peek() === '=' || peek() === '<>')) {
                const equal = peek() === '=';
                position++;
                const right = not();
                value = right === undefined ? undefined : (value === right) === equal;
            }
            return value;
        };
        const and = (): boolean | undefined => {
            let value = equality();
            while (value !== undefined && peek() === 'and') {
                position++;
                const right = equality();
                value = right === undefined ? undefined : value && right;
            }
            return value;
        };
        const or = (): boolean | undefined => {
            let value = and();
            while (value !== undefined && peek() === 'or') {
                position++;
                const right = and();
                value = right === undefined ? undefined : value || right;
            }
            return value;
        };

        const value = or();
        return value === undefined || position !== words.length ? true : value;
    }
}

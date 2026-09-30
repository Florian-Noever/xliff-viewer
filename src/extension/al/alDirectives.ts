/**
 * AL's preprocessor: `#if` / `#elif` / `#else` / `#endif`, `#define` and `#undef`.
 *
 * Evaluated rather than stripped: source commonly holds both branches of an `#if`, and
 * reading both would put two declarations where the compiler sees one — and unbalance the
 * braces when the branches differ. Symbols come from `app.json`'s `preprocessorSymbols` and
 * are compared ignoring case. `#region`, `#pragma` and anything unknown change nothing.
 */

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
        this.symbols = new Set([...symbols].map(symbol => symbol.toLowerCase()));
    }

    /** Whether code at this point is compiled. */
    public get active(): boolean {
        return this.stack.at(-1)?.active ?? true;
    }

    /** Applies one directive line, given without its leading `#`. */
    public apply(line: string): void {
        const match = /^\s*([A-Za-z]+)\s*(.*)$/.exec(line.replace(/\/\/.*$/, ''));
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
                    this.symbols.add(argument.toLowerCase());
                }
                break;
            case 'undef':
                if (this.active) {
                    this.symbols.delete(argument.toLowerCase());
                }
                break;
            default:
                break;
        }
    }

    /**
     * `not`, `and`, `or` and parentheses over symbols. An expression that cannot be read
     * counts as true, so the first branch is the one read — a guess, but a consistent one.
     */
    private evaluate(expression: string): boolean {
        const words = expression.match(/\(|\)|[^\s()]+/g) ?? [];
        let position = 0;
        const peek = (): string | undefined => words[position]?.toLowerCase();

        const primary = (): boolean | undefined => {
            const word = peek();
            if (word === '(') {
                position++;
                const value = or();
                if (peek() !== ')') {
                    return undefined;
                }
                position++;
                return value;
            }
            if (word === undefined || word === ')' || word === 'and' || word === 'or' || word === 'not') {
                return undefined;
            }
            position++;
            return this.symbols.has(word);
        };
        const not = (): boolean | undefined => {
            if (peek() === 'not') {
                position++;
                const value = not();
                return value === undefined ? undefined : !value;
            }
            return primary();
        };
        const and = (): boolean | undefined => {
            let value = not();
            while (value !== undefined && peek() === 'and') {
                position++;
                const right = not();
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

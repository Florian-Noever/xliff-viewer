/** URIs, and the globs that select them. */

import { URI, Utils } from 'vscode-uri';

/**
 * VS Code's own `Uri` implementation. Backslashes become slashes on every platform, as they
 * do in the editor on Windows, so a test reads the same wherever it runs.
 */
export type Uri = URI;
export const Uri = {
    file: (path: string): URI => URI.file(normalisePath(path)),
    parse: (value: string): URI => URI.parse(value),
    joinPath: (base: URI, ...segments: string[]): URI => Utils.joinPath(base, ...segments),
};

/** A path with forward slashes, as every virtual path is kept. */
export function normalisePath(path: string): string {
    return path.replace(/\\/g, '/');
}

export function withoutTrailingSlash(path: string): string {
    return path.endsWith('/') ? path.slice(0, -1) : path;
}

export function isWithin(path: string, folder: string): boolean {
    const base = withoutTrailingSlash(folder);
    return path === base || path.startsWith(`${base}/`);
}

/** A glob relative to a folder, as `findFiles` and watchers take it. */
export class RelativePattern {
    public readonly baseUri: Uri;
    public readonly pattern: string;

    public constructor(base: Uri | string, pattern: string) {
        this.baseUri = typeof base === 'string' ? Uri.file(base) : base;
        this.pattern = pattern;
    }
}

/** A `**` / `*` / `?` glob as a regular expression over a whole path. */
function globRegex(pattern: string): RegExp {
    // One pass with a replacer: expanding `**` in an earlier pass would leave `*`
    // characters that a later single-`*` pass would rewrite again.
    const source = pattern.replace(/\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (token) => {
        switch (token) {
            case '**/':
                return '(?:.*/)?';
            case '**':
                return '.*';
            case '*':
                return '[^/]*';
            case '?':
                return '[^/]';
            default:
                return `\\${token}`;
        }
    });
    return new RegExp(`^${source}$`);
}

/** Whether a virtual path is one the pattern selects: a plain glob from the root, or one relative to its folder. */
export function patternMatches(pattern: string | RelativePattern, path: string): boolean {
    if (typeof pattern === 'string') {
        const regex = globRegex(pattern);
        return regex.test(path) || regex.test(path.replace(/^\//, ''));
    }
    const base = pattern.baseUri.path.endsWith('/') ? pattern.baseUri.path : `${pattern.baseUri.path}/`;
    return path.startsWith(base) && globRegex(pattern.pattern).test(path.slice(base.length));
}

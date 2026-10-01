/** URIs, and the globs that select them. */

import picomatch from 'picomatch';
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

/** A glob as VS Code reads one: dot files match too. */
export function globMatcher(glob: string): (path: string) => boolean {
    return picomatch(glob, { dot: true });
}

/** Which paths a relative pattern selects: those below its folder that its glob matches. */
export function relativeMatcher(pattern: RelativePattern): (path: string) => boolean {
    const base = `${withoutTrailingSlash(pattern.baseUri.path)}/`;
    const matches = globMatcher(pattern.pattern);
    return path => path.startsWith(base) && matches(path.slice(base.length));
}

/**
 * Which absolute paths a watcher's pattern selects. A string glob is applied to the absolute
 * path, as VS Code applies it, written with or without its leading slash.
 */
export function watchedMatcher(pattern: string | RelativePattern): (path: string) => boolean {
    if (typeof pattern !== 'string') {
        return relativeMatcher(pattern);
    }
    const matches = globMatcher(pattern);
    return path => matches(path) || matches(path.replace(/^\//, ''));
}

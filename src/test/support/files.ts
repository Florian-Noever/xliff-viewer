import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Every file below `root` whose path relative to it matches `include`: those paths, written
 * with forward slashes and sorted.
 */
export function listFiles(root: string, include = /./): string[] {
    return readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .filter(path => include.test(path))
        .sort();
}

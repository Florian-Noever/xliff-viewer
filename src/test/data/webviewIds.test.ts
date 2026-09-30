import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const WEBVIEW = fileURLToPath(new URL('../../webview', import.meta.url));

/** Every source file of the webview, except the generated dev-server documents. */
function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === 'fixtures' ? [] : sources(path);
        }
        return /\.(ts|vue)$/.test(entry.name) ? [path] : [];
    });
}

describe('the webview does not take trans-unit ids apart', () => {
    it('holds no copy of the segment separator', () => {
        // A readable id quotes a name that contains the separator, so splitting on it is
        // wrong. The one correct split is shared; a second copy would drift from it.
        const offenders = sources(WEBVIEW).filter(path => /(['"`]) - \1/.test(readFileSync(path, 'utf8')));

        expect(offenders).toEqual([]);
    });
});

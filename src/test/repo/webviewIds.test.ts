import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { listFiles } from '../support/files';

const WEBVIEW = fileURLToPath(new URL('../../webview', import.meta.url));

/** Every source file of the webview, except the generated dev-server documents. */
const sources = (): string[] => listFiles(WEBVIEW, /^(?!fixtures\/).*\.(ts|vue)$/).map(path => join(WEBVIEW, path));

describe('the webview does not take trans-unit ids apart', () => {
    it('holds no copy of the segment separator', () => {
        // A readable id quotes a name that contains the separator, so splitting on it is
        // wrong. The one correct split is shared; a second copy would drift from it.
        const files = sources();
        const offenders = files.filter(path => /(['"`]) - \1/.test(readFileSync(path, 'utf8')));

        expect(files.length).toBeGreaterThan(10);
        expect(files.some(path => path.endsWith('UnitCard.vue'))).toBe(true);
        expect(offenders).toEqual([]);
    });
});

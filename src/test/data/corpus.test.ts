import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));

/**
 * The data project runs with no mocks at all. This smoke test also pins the thing
 * every DATA task depends on: the fixture corpus is reachable and intact (§3.5).
 */
describe('fixture corpus', () => {
    it('contains the five expected files', () => {
        const files = readdirSync(EXAMPLES).sort();
        expect(files).toEqual([
            'Contoso App.de-DE.xlf',
            'Contoso App.en-US.xlf',
            'Contoso App.g.xlf',
            'Fabrikam Base.de-DE.xlf',
            'test.xlf',
        ]);
    });

    it('reads the minimal fixture as XLIFF text', () => {
        const text = readFileSync(`${EXAMPLES}/test.xlf`, 'utf8');
        expect(text).toContain('<xliff');
        expect(text).toContain('<trans-unit id="1">');
    });

    it('sees the BOM that only the base file carries', () => {
        const base = readFileSync(`${EXAMPLES}/Contoso App.g.xlf`, 'utf8');
        const language = readFileSync(`${EXAMPLES}/Contoso App.de-DE.xlf`, 'utf8');
        expect(base.charCodeAt(0)).toBe(0xfeff);
        expect(language.charCodeAt(0)).not.toBe(0xfeff);
    });
});

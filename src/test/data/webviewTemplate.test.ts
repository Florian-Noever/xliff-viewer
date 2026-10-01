import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATE = readFileSync(fileURLToPath(new URL('../../../media/webview.html', import.meta.url)), 'utf8');

/** The Content-Security-Policy as directive name → sources. */
function policy(): ReadonlyMap<string, readonly string[]> {
    const content = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(TEMPLATE)?.[1] ?? '';
    return new Map(content.split(';').map(part => part.trim()).filter(part => part !== '').map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources];
    }));
}

describe('the webview template\'s Content-Security-Policy', () => {
    it('loads nothing it does not name', () => {
        expect(policy().get('default-src')).toEqual(["'none'"]);
    });

    it('runs only the script carrying this load\'s nonce', () => {
        expect(policy().get('script-src')).toEqual(["'nonce-%NONCE%'"]);
    });

    it('allows no inline style or script anywhere', () => {
        expect([...policy().values()].flat()).not.toContain("'unsafe-inline'");
        expect([...policy().values()].flat()).not.toContain("'unsafe-eval'");
    });
});

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Only a source scan can check motion and forced colours: jsdom applies no stylesheet. It lives
 * in `data` because the webview tsconfig has no node types, and there `import.meta.glob` with
 * `?raw` returns an empty string for a `.css` file: Vite's CSS pipeline claims it first.
 */

const WEBVIEW = fileURLToPath(new URL('../../webview', import.meta.url));

function sources(directory: string, matching: RegExp): { path: string; text: string }[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
            return sources(path, matching);
        }
        return matching.test(entry.name) ? [{ path, text: readFileSync(path, 'utf8') }] : [];
    });
}

const styled = (): { path: string; text: string }[] => sources(WEBVIEW, /\.(vue|css)$/);

describe('what the webview does with motion and with a forced palette', () => {
    it('reads more than a handful of files, so a passing scan means something', () => {
        // Without this the whole file passes when the walk returns nothing.
        const files = styled();

        expect(files.length).toBeGreaterThan(10);
        expect(files.some(file => file.path.endsWith('global.css'))).toBe(true);
    });

    it('animates nothing outside a reduced-motion guard', () => {
        const unguarded = styled().filter((file) => {
            const [beforeTheGuard] = file.text.split('@media (prefers-reduced-motion: no-preference)');
            return beforeTheGuard.includes('animation:') || beforeTheGuard.includes('transition:');
        });

        expect(unguarded.map(file => file.path.split('/').pop())).toEqual([]);
    });

    it('names the system palette wherever a forced-colours theme would take ours', () => {
        // The focus ring, the progress bar and the pressed filter chip: everything whose
        // only signal is a colour we chose. A state badge and a hint carry text beside the
        // colour and survive the forcing untouched, so neither needs a block here.
        const guarded = styled()
            .filter(file => file.text.includes('@media (forced-colors: active)'))
            .map(file => file.path.split('/').pop());

        expect(guarded.sort()).toEqual(['ProgressBar.vue', 'Toolbar.vue', 'global.css']);
    });
});

describe('what the webview takes from the theme', () => {
    const DEV_THEME = 'devTheme.css';
    const exceptDevTheme = (): { path: string; text: string }[] => styled().filter(file => !file.path.endsWith(`/${DEV_THEME}`));

    it('defines no theme colour of its own outside the dev server\'s stand-in', () => {
        // VS Code passes a webview only the colours the theme defines; a fallback declared
        // here would replace every colour a theme leaves out, dark or light.
        const declaring = exceptDevTheme().filter(file => /--vscode-[\w-]+\s*:/.test(file.text));

        expect(declaring.map(file => file.path.split('/').pop())).toEqual([]);
    });

    it('writes no colour literal outside the dev server\'s stand-in', () => {
        const literal = /(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/;

        expect(exceptDevTheme().filter(file => literal.test(file.text)).map(file => file.path.split('/').pop())).toEqual([]);
    });

    it('loads the stand-in in the dev server and nowhere else', () => {
        const read = (path: string): string => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');

        expect(read('index.html')).toContain(DEV_THEME);
        expect(read('media/webview.html')).not.toContain(DEV_THEME);
        expect(read('src/webview/main.ts')).not.toContain(DEV_THEME);
        expect(styled().filter(file => file.text.includes(DEV_THEME))).toEqual([]);
    });

    it('gives a fallback to the colours a standard theme leaves undefined', () => {
        // An undefined variable inside a border shorthand drops the whole border.
        const bare = /var\(--vscode-(input-border|button-border|inputValidation-errorForeground)\)/;

        expect(styled().filter(file => bare.test(file.text)).map(file => file.path.split('/').pop())).toEqual([]);
    });
});

describe('the chips row of a unit card', () => {
    it('has one rule, which starts the row where the values start', () => {
        const card = styled().find(file => file.path.endsWith('/UnitCard.vue'))?.text ?? '';
        const rules = card.match(/^\.chips \{[^}]*\}/gm) ?? [];

        expect(rules).toHaveLength(1);
        expect(rules[0]).toContain('var(--label-column)');
    });
});

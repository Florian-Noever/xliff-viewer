import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `POLISH-02`. Two §11.7 promises that only a source scan can check — jsdom applies no
 * stylesheet, so a mounted component cannot be asked whether it animates or what it does
 * under a forced-colours theme.
 *
 * They live in the `data` project rather than beside the other webview tests because the
 * webview tsconfig has **no node types**, deliberately: that is what keeps `node:fs` out of
 * `src/webview/`. `import.meta.glob` is the way around it there, and it does not work here
 * — with `?raw` it hands back an **empty string** for a `.css` file, because Vite's CSS
 * pipeline claims the file before the raw loader sees it. A scan written that way checks
 * the one plain stylesheet not at all and reports it clean.
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

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `POLISH-04`. The README is documentation that ships **inside the VSIX**, so it is read on
 * the marketplace page beside the settings it describes. A settings table that has drifted
 * from `contributes.configuration` is worse than no table: it is wrong with authority.
 *
 * Checked here rather than by eye because it drifts silently — `POLISH-01` added a setting,
 * and nothing but a person noticing would have caught the table staying at seven rows.
 */

const root = (name: string): string => readFileSync(fileURLToPath(new URL(`../../../${name}`, import.meta.url)), 'utf8');

interface Row {
    readonly key: string;
    readonly type: string;
    readonly fallback: string;
}

/** `| \`key\` | \`type\` | \`default\` | prose |` — the shape the table has had since it was written. */
function documented(): Row[] {
    const rows: Row[] = [];
    for (const line of root('README.md').split(/\r?\n/)) {
        const match = /^\| `(xliffViewer\.[^`]+)` \| `([^`]+)` \| `([^`]*)` \|/.exec(line);
        if (match !== null) {
            rows.push({ key: match[1], type: match[2], fallback: match[3] });
        }
    }
    return rows;
}

function declared(): Row[] {
    const manifest = JSON.parse(root('package.json')) as {
        contributes: { configuration: { properties: Record<string, { type: string; default: unknown }> } };
    };
    return Object.entries(manifest.contributes.configuration.properties).map(([key, property]) => ({
        key,
        type: property.type,
        fallback: typeof property.default === 'string' && property.default !== '' ? property.default : JSON.stringify(property.default),
    }));
}

describe('the README, as documentation that ships', () => {
    it('documents every setting the extension declares, and no setting it does not', () => {
        expect(documented().map(row => row.key).sort()).toEqual(declared().map(row => row.key).sort());
    });

    it('gives each of them the type and default the manifest gives it', () => {
        const table = new Map(documented().map(row => [row.key, row]));

        for (const setting of declared()) {
            expect(table.get(setting.key)?.type, `${setting.key}: type`).toBe(setting.type);
            expect(table.get(setting.key)?.fallback, `${setting.key}: default`).toBe(setting.fallback);
        }
    });

    it('pays the codicons attribution, which is a licence condition rather than a courtesy', () => {
        // CC BY 4.0 requires attribution wherever the work is distributed, and the README
        // is what ships. §14.6 lists it as an obligation for exactly this reason.
        const readme = root('README.md');

        expect(readme).toContain('@vscode/codicons');
        expect(readme).toContain('CC BY 4.0');
    });

    it('names the licence the manifest claims', () => {
        expect(JSON.parse(root('package.json')).license).toBe('MIT');
        expect(root('LICENSE')).toContain('MIT License');
        expect(root('README.md')).toContain('[MIT](LICENSE)');
    });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { DEV_FIXTURE_ROOTS, DEV_FIXTURE_SOURCE, isDevFixtureUnit } from '../../shared/devFixture';
import { DEV_DOCUMENT } from '../../webview/fixtures/devDocument';
import { XliffState } from '../../shared/state';

import type { XliffDocumentDto } from '../../shared/dto';

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));

/** Rebuilds the fixture the way the generator did, straight from the corpus. */
function rebuild(): XliffDocumentDto {
    const model = parseXliff(readFileSync(`${EXAMPLES}/${DEV_FIXTURE_SOURCE}`, 'utf8'));
    const trimmed = {
        ...model,
        files: model.files.map(file => ({
            ...file,
            body: {
                ...file.body,
                units: file.body.units.filter(unit => isDevFixtureUnit(unit.id)),
                groups: file.body.groups.map(group => ({
                    ...group,
                    units: group.units.filter(unit => isDevFixtureUnit(unit.id)),
                })),
            },
        })),
    };
    return projectDocument(trimmed, {
        uri: `file:///workspace/Translations/${DEV_FIXTURE_SOURCE}`,
        fileName: DEV_FIXTURE_SOURCE,
    });
}

describe('the dev-server fixture', () => {
    it('is exactly what the corpus produces, not invented data', () => {
        // Without this the fixture decays: someone tweaks it to make a screenshot look
        // right and the dev server stops showing what the extension actually sends.
        expect(DEV_DOCUMENT).toEqual(rebuild());
    });

    it('carries every root it claims to', () => {
        const roots = DEV_DOCUMENT.files[0].tree.map(node => node.key);
        expect(roots.sort()).toEqual([...DEV_FIXTURE_ROOTS].sort());
    });

    it('covers what UI work needs to see', () => {
        const units = DEV_DOCUMENT.files[0].units;

        expect(units.length).toBeGreaterThan(50);
        expect(units.some(unit => unit.maxwidth !== undefined)).toBe(true);
        expect(units.some(unit => unit.alObjectTarget !== undefined)).toBe(true);
        expect(units.some(unit => unit.developerHint !== undefined)).toBe(true);
        expect(new Set(units.map(unit => unit.state))).toEqual(new Set([XliffState.translated, XliffState.empty]));
    });

    it('keeps the two objects that share a hash apart', () => {
        // Table 625177701 and Page 625177701 are the same name under two object types
        // (§4.5) — the case the tree must not merge, visible on the dev server.
        const shared = DEV_DOCUMENT.files[0].tree.filter(node => node.key.endsWith('625177701'));

        expect(shared).toHaveLength(2);
        expect(shared.map(node => node.type).sort()).toEqual(['Page', 'Table']);
        expect(new Set(shared.map(node => node.name))).toEqual(new Set(['PTE Sample Object 1']));
    });

    it('is four levels deep somewhere, so nesting is visible', () => {
        interface Nested { readonly children: readonly Nested[] }
        const depth = (nodes: readonly Nested[], level = 0): number =>
            nodes.length === 0 ? level : Math.max(...nodes.map((node: Nested) => depth(node.children, level + 1)));

        expect(depth(DEV_DOCUMENT.files[0].tree)).toBe(4);
    });

    it('stays small enough to live in the repository', () => {
        expect(JSON.stringify(DEV_DOCUMENT).length).toBeLessThan(64 * 1024);
    });
});

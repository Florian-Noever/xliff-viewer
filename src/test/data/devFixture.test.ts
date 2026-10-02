import { describe, expect, it } from 'vitest';

import { DEV_DOCUMENT } from '../../webview/fixtures/devDocument';
import { DEV_NAMESPACED_DOCUMENT } from '../../webview/fixtures/devNamespacedDocument';
import { XliffState } from '../../shared/state';
import { buildDevDocument, buildDevNamespacedDocument, DEV_FIXTURE_ROOTS } from '../fixtures/devFixture';

describe('the dev-server fixture', () => {
    it('is exactly what the corpus produces, not hand-edited', () => {
        expect(DEV_DOCUMENT).toEqual(buildDevDocument());
    });

    it('has a namespaced sibling that is exactly what the corpus produces', () => {
        expect(DEV_NAMESPACED_DOCUMENT).toEqual(buildDevNamespacedDocument());
        expect(DEV_NAMESPACED_DOCUMENT.files[0].namespaced).toBe(true);
    });

    it('carries every root it claims to, one object-type level down', () => {
        const roots = DEV_DOCUMENT.files[0].tree.flatMap(group => group.children).map(node => node.key);
        expect(roots.sort()).toEqual([...DEV_FIXTURE_ROOTS].sort());
    });

    it('groups those roots by their object type, and says how many', () => {
        const groups = DEV_DOCUMENT.files[0].tree;

        expect(groups.every(group => group.group === true)).toBe(true);
        expect(groups.reduce((sum, group) => sum + group.children.length, 0)).toBe(DEV_FIXTURE_ROOTS.length);
        expect(groups.map(group => group.name)).toEqual(groups.map(group => `${group.type}s (${group.children.length})`));
        expect(groups.map(group => group.name)).toContain('Codeunits (1)');
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
        // Table 1518856175 and Page 1518856175 are the same name under two object types:
        // the case the tree must not merge, visible on the dev server.
        const shared = DEV_DOCUMENT.files[0].tree
            .flatMap(group => group.children)
            .filter(node => node.key.endsWith(' 1518856175'));

        expect(shared).toHaveLength(2);
        expect(shared.map(node => node.type).sort()).toEqual(['Page', 'Table']);
        expect(shared[0].name).toBeDefined();
        expect(shared[1].name).toBe(shared[0].name);
    });

    it('is five levels deep somewhere, its object-type level included, so nesting is visible', () => {
        interface Nested { readonly children: readonly Nested[] }
        const depth = (nodes: readonly Nested[], level = 0): number =>
            nodes.length === 0 ? level : Math.max(...nodes.map((node: Nested) => depth(node.children, level + 1)));

        expect(depth(DEV_DOCUMENT.files[0].tree)).toBe(5);
    });

    it('stays small enough to live in the repository', () => {
        expect(JSON.stringify(DEV_DOCUMENT).length).toBeLessThan(64 * 1024);
    });
});

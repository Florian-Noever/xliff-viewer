import { describe, expect, it } from 'vitest';
import { computed, defineComponent, ref } from 'vue';
import { mount } from '@vue/test-utils';

import { expandableKeys, flattenTree, keysToDepth, useTreeFlatten } from '../../webview/composables/useTreeFlatten';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '../../shared/dto';
import type { TreeView } from '../../webview/composables/useTreeFlatten';

const node = (key: string, type: string, children: AlNodeDto[] = [], name?: string): AlNodeDto =>
    ({ key, type, name, children });

/**
 * Table 1
 *   Field 2
 *     Property 3
 *   Property 4
 * Table 5
 */
const TREE: AlNodeDto[] = [
    node('Table 1', 'Table', [
        node('Table 1 - Field 2', 'Field', [node('Table 1 - Field 2 - Property 3', 'Property')], 'Code'),
        node('Table 1 - Property 4', 'Property'),
    ], 'Customer'),
    node('Table 5', 'Table', [], 'Vendor'),
];

const unit = (id: string): TransUnitDto => ({ id, source: id, state: 'translated', translate: true, notes: [] });

const UNITS = new Map<string, TransUnitDto>([
    ['Table 1 - Field 2 - Property 3', unit('Table 1 - Field 2 - Property 3')],
    ['Table 1 - Property 4', unit('Table 1 - Property 4')],
    ['Table 5', unit('Table 5')],
]);

function file(tree: AlNodeDto[], hasAlIds = true, index = 0): XliffFileDto {
    return { index, sourceLanguage: 'en-US', targetLanguage: 'de-DE', tree, units: [...UNITS.values()], hasAlIds };
}

/** `useTreeFlatten` uses `watch`, so it needs a real component scope. */
function view(initial: XliffFileDto | undefined, depth = 1) {
    const active = ref<XliffFileDto | undefined>(initial);
    const expandDepth = ref(depth);
    const uri = ref<string | undefined>('file:///w/one.xlf');
    let captured: TreeView | undefined;

    mount(defineComponent({
        setup() {
            captured = useTreeFlatten({
                file: computed(() => active.value),
                unitsById: computed(() => UNITS),
                defaultExpandDepth: computed(() => expandDepth.value),
                documentUri: computed(() => uri.value),
            });
            return () => null;
        },
    }));

    if (captured === undefined) {
        throw new Error('composable did not run');
    }
    return { tree: captured, active, expandDepth, uri };
}

describe('flattenTree', () => {
    it('shows only roots when nothing is expanded', () => {
        const rows = flattenTree(TREE, new Set(), UNITS);

        expect(rows.map(row => row.key)).toEqual(['Table 1', 'Table 5']);
        expect(rows.map(row => row.depth)).toEqual([0, 0]);
    });

    it('reveals a node\'s children when it is expanded, and only its children', () => {
        const rows = flattenTree(TREE, new Set(['Table 1']), UNITS);

        expect(rows.map(row => row.key)).toEqual([
            'Table 1',
            'Table 1 - Field 2',
            'Table 1 - Property 4',
            'Table 5',
        ]);
        expect(rows.map(row => row.depth)).toEqual([0, 1, 1, 0]);
    });

    it('nests as deep as the expansion goes', () => {
        const rows = flattenTree(TREE, new Set(['Table 1', 'Table 1 - Field 2']), UNITS);

        expect(rows.map(row => row.depth)).toEqual([0, 1, 2, 1, 0]);
    });

    it('ignores an expanded key for a node with no children', () => {
        const rows = flattenTree(TREE, new Set(['Table 5']), UNITS);

        expect(rows).toHaveLength(2);
        expect(rows[1].expanded).toBe(false);
    });

    it('attaches the unit to the node whose key is its id (DEC-028)', () => {
        const rows = flattenTree(TREE, new Set(['Table 1']), UNITS);
        const byKey = new Map(rows.map(row => [row.key, row]));

        expect(byKey.get('Table 1 - Property 4')?.unit?.id).toBe('Table 1 - Property 4');
        expect(byKey.get('Table 1')?.unit).toBeUndefined();
    });

    it('reports sibling position and count, which a virtualised tree must state itself', () => {
        const rows = flattenTree(TREE, new Set(['Table 1']), UNITS);

        expect(rows.map(row => `${row.position}/${row.siblings}`)).toEqual(['1/2', '1/2', '2/2', '2/2']);
    });

    it('is pure — the same inputs give an equal result', () => {
        const expanded = new Set(['Table 1']);
        expect(flattenTree(TREE, expanded, UNITS)).toEqual(flattenTree(TREE, expanded, UNITS));
    });

    it('handles an empty tree', () => {
        expect(flattenTree([], new Set(), UNITS)).toEqual([]);
    });
});

describe('keysToDepth', () => {
    it('expands nothing at zero', () => {
        expect(keysToDepth(TREE, 0)).toEqual([]);
    });

    it('takes only nodes that have children', () => {
        expect(keysToDepth(TREE, 1)).toEqual(['Table 1']);
    });

    it('goes deeper as asked', () => {
        expect(keysToDepth(TREE, 2)).toEqual(['Table 1', 'Table 1 - Field 2']);
    });

    it('stops at the bottom rather than at the number', () => {
        expect(keysToDepth(TREE, 99)).toEqual(expandableKeys(TREE));
    });
});

describe('expansion', () => {
    it('opens to defaultExpandDepth when the file arrives', () => {
        const { tree } = view(file(TREE), 1);
        expect(tree.rows.value.map(row => row.key)).toEqual([
            'Table 1',
            'Table 1 - Field 2',
            'Table 1 - Property 4',
            'Table 5',
        ]);
    });

    it('opens nothing when the setting is zero', () => {
        const { tree } = view(file(TREE), 0);
        expect(tree.rows.value).toHaveLength(2);
    });

    it('toggles a node both ways', () => {
        const { tree } = view(file(TREE), 0);

        tree.toggle('Table 1');
        expect(tree.rows.value).toHaveLength(4);

        tree.toggle('Table 1');
        expect(tree.rows.value).toHaveLength(2);
    });

    it('expands and collapses everything', () => {
        const { tree } = view(file(TREE), 0);

        tree.expandAll();
        expect(tree.rows.value).toHaveLength(5);

        tree.collapseAll();
        expect(tree.rows.value).toHaveLength(2);
    });

    it('keeps what was open when the same file is re-parsed', () => {
        // Expansion keys are id prefixes, which survive a re-parse — that is what stops an
        // external edit collapsing the tree under the translator (EDIT-02).
        const { tree, active } = view(file(TREE), 0);
        tree.toggle('Table 1');

        active.value = file(structuredClone(TREE));

        expect(tree.rows.value).toHaveLength(4);
    });

    it('opens a file it has not seen before to the configured depth (DEC-020)', () => {
        const { tree, active } = view(file(TREE), 0);
        tree.expandAll();

        active.value = file(TREE, true, 1);

        expect(tree.rows.value).toHaveLength(2);
    });

    it('gives each file back its own expansion when the user switches away and back', () => {
        // The switcher is not a reset button. Whatever the translator had open in a file
        // is what they should find when they come back to it.
        const { tree, active } = view(file(TREE), 0);
        tree.expandAll();
        expect(tree.rows.value).toHaveLength(5);

        active.value = file(TREE, true, 1);
        tree.toggle('Table 1');
        expect(tree.rows.value).toHaveLength(4);

        active.value = file(TREE, true, 0);
        expect(tree.rows.value).toHaveLength(5);

        active.value = file(TREE, true, 1);
        expect(tree.rows.value).toHaveLength(4);
    });

    it('starts over for a different document, whose file indices mean something else', () => {
        // Two documents both have a file 0. Keeping the first one's expansion would name
        // nodes the second does not have, and the tree would open collapsed for no
        // visible reason — which is exactly what the dev server showed.
        const { tree, active, uri } = view(file(TREE), 0);
        tree.expandAll();
        expect(tree.rows.value).toHaveLength(5);

        uri.value = 'file:///w/another.xlf';
        active.value = file(structuredClone(TREE));

        expect(tree.rows.value).toHaveLength(2);
    });

    it('keeps focus per file too, so switching back does not lose the cursor', () => {
        const { tree, active } = view(file(TREE), 1);
        tree.focus('Table 1 - Field 2');

        active.value = file(TREE, true, 1);
        expect(tree.focusedKey.value).toBeUndefined();

        active.value = file(TREE, true, 0);
        expect(tree.focusedKey.value).toBe('Table 1 - Field 2');
    });

    it('applies the configured depth to each file the first time it is seen', () => {
        const { tree, active, expandDepth } = view(file(TREE), 2);
        expect(tree.rows.value).toHaveLength(5);

        expandDepth.value = 0;
        active.value = file(TREE, true, 1);

        expect(tree.rows.value).toHaveLength(2);
    });
});

describe('the object-type level (DEC-033)', () => {
    const GROUPED: AlNodeDto[] = [{ key: 'type:Table', type: 'Table', name: 'Tables (2)', group: true, children: TREE }];

    it('keeps what defaultExpandDepth always opened, with the group above it', () => {
        // Depth 1 opened the objects and showed their members. It still does; the level
        // the setting was never written for is paid for separately.
        const plain = view(file(TREE), 1).tree;
        const grouped = view(file(GROUPED), 1).tree;

        const opened = grouped.rows.value.map(row => row.key).filter(key => key !== 'type:Table');
        expect(opened).toEqual(plain.rows.value.map(row => row.key));
    });

    it('shows the objects collapsed at depth zero, which is what depth zero meant', () => {
        // Before the group level, 0 meant "the objects, none of them opened". It still
        // does — the group is opened for free, because it is not a level the reader asked
        // to keep shut.
        const grouped = view(file(GROUPED), 0).tree;
        const plain = view(file(TREE), 0).tree;

        expect(grouped.rows.value.map(row => row.key)).toEqual(['type:Table', ...plain.rows.value.map(row => row.key)]);
    });

    it('carries the flag through to the row, so the row can render a label not a symbol', () => {
        const grouped = view(file(GROUPED), 1).tree;

        expect(grouped.rows.value[0].group).toBe(true);
        expect(grouped.rows.value.slice(1).every(row => row.group === undefined)).toBe(true);
    });

    it('does not compensate for a file that has no groups', () => {
        const plain = view(file(TREE), 2).tree;

        expect(plain.rows.value.map(row => row.key)).toEqual(flattenTree(TREE, new Set(keysToDepth(TREE, 2)), UNITS).map(row => row.key));
    });
});

describe('an edit does not disturb the tree (EDIT-02)', () => {
    it('keeps expansion when a patched unit arrives', () => {
        // `patchUnits` replaces units, never the tree, and expansion is keyed on node keys
        // — so the reseed watcher must not fire and the open nodes must stay open.
        const { tree, active } = view(file(TREE), 0);
        tree.toggle('Table 1');
        const opened = tree.rows.value.map(row => row.key);

        const edited = new Map(UNITS);
        edited.set('Table 1 - Property 4', { ...unit('Table 1 - Property 4'), target: 'EditedTranslation' });
        active.value = { ...file(TREE), units: [...edited.values()] };

        expect(tree.rows.value.map(row => row.key)).toEqual(opened);
    });

    it('keeps the focused row where it was', () => {
        const { tree, active } = view(file(TREE), 1);
        tree.focus('Table 1 - Property 4');

        active.value = { ...file(TREE), units: [...UNITS.values()] };

        expect(tree.focusedKey.value).toBe('Table 1 - Property 4');
    });
});

describe('keyboard movement', () => {
    it('starts at the first row, wherever the delta points', () => {
        const { tree } = view(file(TREE), 1);

        tree.moveFocus(-1);

        expect(tree.focusedKey.value).toBe('Table 1');
    });

    it('moves and clamps at both ends', () => {
        const { tree } = view(file(TREE), 1);

        tree.moveFocus(1);
        tree.moveFocus(1);
        expect(tree.focusedKey.value).toBe('Table 1 - Field 2');

        tree.moveFocus(-99);
        expect(tree.focusedKey.value).toBe('Table 1');

        tree.moveFocus(99);
        expect(tree.focusedKey.value).toBe('Table 5');
    });

    it('does nothing when there is nothing to focus', () => {
        const { tree } = view(file([]), 1);

        tree.moveFocus(1);

        expect(tree.focusedKey.value).toBeUndefined();
    });

    it('opens a closed node, then steps into it', () => {
        const { tree } = view(file(TREE), 0);
        tree.focus('Table 1');

        tree.expandFocused();
        expect(tree.rows.value).toHaveLength(4);
        expect(tree.focusedKey.value).toBe('Table 1');

        tree.expandFocused();
        expect(tree.focusedKey.value).toBe('Table 1 - Field 2');
    });

    it('does nothing on a leaf', () => {
        const { tree } = view(file(TREE), 0);
        tree.focus('Table 5');

        tree.expandFocused();

        expect(tree.focusedKey.value).toBe('Table 5');
        expect(tree.rows.value).toHaveLength(2);
    });

    it('closes an open node, then steps out to its parent', () => {
        const { tree } = view(file(TREE), 2);
        tree.focus('Table 1 - Field 2');

        tree.collapseFocused();
        expect(tree.rows.value.map(row => row.key)).not.toContain('Table 1 - Field 2 - Property 3');
        expect(tree.focusedKey.value).toBe('Table 1 - Field 2');

        tree.collapseFocused();
        expect(tree.focusedKey.value).toBe('Table 1');
    });

    it('stays put at the top level rather than wrapping', () => {
        const { tree } = view(file(TREE), 0);
        tree.focus('Table 5');

        tree.collapseFocused();

        expect(tree.focusedKey.value).toBe('Table 5');
    });
});

describe('the flat-list note (DEC-022)', () => {
    it('appears only for a file with no AL structure', () => {
        expect(view(file(TREE, true)).tree.showFlatNote.value).toBe(false);
        expect(view(file(TREE, false)).tree.showFlatNote.value).toBe(true);
    });

    it('stays dismissed across a re-parse', () => {
        const { tree, active } = view(file(TREE, false));

        tree.dismissFlatNote();
        expect(tree.showFlatNote.value).toBe(false);

        active.value = file(structuredClone(TREE), false);
        expect(tree.showFlatNote.value).toBe(false);
    });

    it('comes back for a different file, which the user has not seen', () => {
        const { tree, active } = view(file(TREE, false));
        tree.dismissFlatNote();

        active.value = file(TREE, false, 1);

        expect(tree.showFlatNote.value).toBe(true);
    });

    it('forgets a dismissal when a different document arrives', () => {
        const { tree, active, uri } = view(file(TREE, false));
        tree.dismissFlatNote();

        uri.value = 'file:///w/another.xlf';
        active.value = file(TREE, false);

        expect(tree.showFlatNote.value).toBe(true);
    });

    it('stays dismissed per file, so switching back does not nag again', () => {
        const { tree, active } = view(file(TREE, false));
        tree.dismissFlatNote();

        active.value = file(TREE, false, 1);
        active.value = file(TREE, false, 0);

        expect(tree.showFlatNote.value).toBe(false);
    });

    it('is absent when there is no file at all', () => {
        expect(view(undefined).tree.showFlatNote.value).toBe(false);
    });
});

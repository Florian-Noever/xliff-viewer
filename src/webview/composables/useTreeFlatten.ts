import { computed, ref, watch } from 'vue';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '@shared/dto';
import type { ComputedRef, Ref } from 'vue';

/**
 * The tree, flattened to the rows that are actually visible (MASTER_PLAN §11.4).
 *
 * Virtualisation needs a flat array, and the array changes on every expansion, so
 * `flattenTree` is a pure function of its inputs and the composable holds it in a
 * `computed` — Vue then recomputes it only when the tree, the expansion set or the unit
 * index actually change.
 *
 * Expansion keys off the **node key**, which is the trans-unit id prefix and is stable
 * across a re-parse. That is what lets an external edit rebuild the tree without
 * collapsing what the translator had open (`EDIT-02`).
 */

export interface TreeRow {
    /** The node key: the joined id prefix, and the unit's id where it carries one (`DEC-028`). */
    readonly key: string;
    readonly type: string;
    readonly name?: string;
    /** Zero-based; `aria-level` is this plus one. */
    readonly depth: number;
    readonly hasChildren: boolean;
    readonly expanded: boolean;
    /** Present when this node carries a unit — a leaf, usually, but an id can be another's prefix. */
    readonly unit?: TransUnitDto;
    /** One-based position among its siblings, for `aria-posinset`. */
    readonly position: number;
    /** How many siblings it has, for `aria-setsize`. A virtualised tree must say, since the DOM cannot show it. */
    readonly siblings: number;
}

export interface TreeView {
    readonly rows: ComputedRef<readonly TreeRow[]>;
    /** The row the keyboard is on. Undefined before anything is focused. */
    readonly focusedKey: Ref<string | undefined>;
    readonly focusedIndex: ComputedRef<number>;
    /** True when this file has no AL structure and the flat-list note has not been dismissed (`DEC-022`). */
    readonly showFlatNote: ComputedRef<boolean>;
    toggle(key: string): void;
    expandAll(): void;
    collapseAll(): void;
    /** Moves focus by `delta` rows, clamped. */
    moveFocus(delta: number): void;
    focus(key: string): void;
    /** →: opens a closed node, else steps into its first child. */
    expandFocused(): void;
    /** ←: closes an open node, else steps out to its parent. */
    collapseFocused(): void;
    dismissFlatNote(): void;
}

/** Pure: the same inputs always produce the same rows, in document order. */
export function flattenTree(
    nodes: readonly AlNodeDto[],
    expanded: ReadonlySet<string>,
    unitsById: ReadonlyMap<string, TransUnitDto>,
): TreeRow[] {
    const rows: TreeRow[] = [];

    const walk = (siblings: readonly AlNodeDto[], depth: number): void => {
        siblings.forEach((node, index) => {
            const hasChildren = node.children.length > 0;
            const isExpanded = hasChildren && expanded.has(node.key);

            rows.push({
                key: node.key,
                type: node.type,
                name: node.name,
                depth,
                hasChildren,
                expanded: isExpanded,
                unit: unitsById.get(node.key),
                position: index + 1,
                siblings: siblings.length,
            });

            if (isExpanded) {
                walk(node.children, depth + 1);
            }
        });
    };

    walk(nodes, 0);
    return rows;
}

/** Every node that can be expanded, down to `depth` levels. `0` expands nothing. */
export function keysToDepth(nodes: readonly AlNodeDto[], depth: number, level = 0): string[] {
    if (level >= depth) {
        return [];
    }
    return nodes.flatMap(node => (node.children.length === 0
        ? []
        : [node.key, ...keysToDepth(node.children, depth, level + 1)]));
}

/** Every node that has children, at any depth. */
export function expandableKeys(nodes: readonly AlNodeDto[]): string[] {
    return nodes.flatMap(node => (node.children.length === 0 ? [] : [node.key, ...expandableKeys(node.children)]));
}

export interface TreeSource {
    readonly file: ComputedRef<XliffFileDto | undefined>;
    readonly unitsById: ComputedRef<ReadonlyMap<string, TransUnitDto>>;
    readonly defaultExpandDepth: ComputedRef<number>;
}

export function useTreeFlatten(source: TreeSource): TreeView {
    const expanded = ref(new Set<string>());
    const focusedKey = ref<string | undefined>(undefined);
    const dismissedNoteFor = ref<string | undefined>(undefined);

    const tree = computed(() => source.file.value?.tree ?? []);
    const rows = computed(() => flattenTree(tree.value, expanded.value, source.unitsById.value));
    const focusedIndex = computed(() => rows.value.findIndex(row => row.key === focusedKey.value));

    const showFlatNote = computed(() => source.file.value?.hasAlIds === false
        && dismissedNoteFor.value !== source.file.value.index.toString());

    // A new file — a switch, or a re-parse — starts at the configured depth. Expansion
    // keys are id prefixes, so a re-parse of the *same* file keeps what was open.
    watch(
        () => [source.file.value?.index, tree.value] as const,
        ([, nodes], previous) => {
            if (previous !== undefined && previous[0] === source.file.value?.index) {
                return;
            }
            expanded.value = new Set(keysToDepth(nodes, source.defaultExpandDepth.value));
            focusedKey.value = undefined;
        },
        // Synchronous: the expansion set and the rows must agree within one tick, or a
        // file switch renders a frame of the new tree under the old file's expansion.
        { immediate: true, flush: 'sync' },
    );

    function toggle(key: string): void {
        const next = new Set(expanded.value);
        if (!next.delete(key)) {
            next.add(key);
        }
        expanded.value = next;
    }

    function expandAll(): void {
        expanded.value = new Set(expandableKeys(tree.value));
    }

    function collapseAll(): void {
        expanded.value = new Set();
    }

    function focus(key: string): void {
        focusedKey.value = key;
    }

    function moveFocus(delta: number): void {
        const visible = rows.value;
        if (visible.length === 0) {
            return;
        }
        // Nothing focused counts as index -1, so Down lands on the first row and End on
        // the last, without either needing a special case.
        const next = Math.min(visible.length - 1, Math.max(0, focusedIndex.value + delta));
        focusedKey.value = visible[next].key;
    }

    function expandFocused(): void {
        const row = rows.value[focusedIndex.value];
        if (row === undefined) {
            return;
        }
        if (row.hasChildren && !row.expanded) {
            toggle(row.key);
            return;
        }
        if (row.hasChildren) {
            moveFocus(1);
        }
    }

    function collapseFocused(): void {
        const index = focusedIndex.value;
        const row = rows.value[index];
        if (row === undefined) {
            return;
        }
        if (row.expanded) {
            toggle(row.key);
            return;
        }
        // Already closed, or a leaf: step out to the nearest shallower row, which is the parent.
        for (let above = index - 1; above >= 0; above--) {
            if (rows.value[above].depth < row.depth) {
                focusedKey.value = rows.value[above].key;
                return;
            }
        }
    }

    function dismissFlatNote(): void {
        dismissedNoteFor.value = source.file.value?.index.toString();
    }

    return {
        rows,
        focusedKey,
        focusedIndex,
        showFlatNote,
        toggle,
        expandAll,
        collapseAll,
        moveFocus,
        focus,
        expandFocused,
        collapseFocused,
        dismissFlatNote,
    };
}

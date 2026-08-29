import { computed, ref, watch } from 'vue';

import { indexNodes } from '../generatorNote';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '@shared/dto';
import type { ComputedRef, WritableComputedRef } from 'vue';

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
 *
 * Expansion and focus are held **per `<file>`** (`DEC-020`): switching away and back
 * returns the translator to what they had open, rather than to `defaultExpandDepth`.
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
    /** The synthetic object-type level, which is a label rather than a symbol (`DEC-033`). */
    readonly group?: true;
    /** One-based position among its siblings, for `aria-posinset`. */
    readonly position: number;
    /** How many siblings it has, for `aria-setsize`. A virtualised tree must say, since the DOM cannot show it. */
    readonly siblings: number;
}

export interface TreeView {
    readonly rows: ComputedRef<readonly TreeRow[]>;
    /** Every node of the active file by key — what rebuilds the generator note (§4.4). */
    readonly nodesByKey: ComputedRef<ReadonlyMap<string, AlNodeDto>>;
    /** The row the keyboard is on. Undefined before anything is focused. */
    readonly focusedKey: WritableComputedRef<string | undefined>;
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

/**
 * Pure: the same inputs always produce the same rows, in document order.
 *
 * `visible` is the search result (§11.5). When it is present the tree shows only those
 * keys, and **expansion follows the filter rather than the user**: a node opens because a
 * descendant matched, not because the user opened it. The user's own expansion set is
 * untouched, which is what lets Escape put the tree back exactly as it was.
 */
export function flattenTree(
    nodes: readonly AlNodeDto[],
    expanded: ReadonlySet<string>,
    unitsById: ReadonlyMap<string, TransUnitDto>,
    visible?: ReadonlySet<string>,
): TreeRow[] {
    const rows: TreeRow[] = [];

    const walk = (siblings: readonly AlNodeDto[], depth: number): void => {
        const shown = visible === undefined ? siblings : siblings.filter(node => visible.has(node.key));

        shown.forEach((node, index) => {
            const hasChildren = node.children.length > 0;
            const isExpanded = visible === undefined
                ? hasChildren && expanded.has(node.key)
                : node.children.some(child => visible.has(child.key));

            rows.push({
                key: node.key,
                type: node.type,
                name: node.name,
                group: node.group,
                depth,
                hasChildren,
                expanded: isExpanded,
                unit: unitsById.get(node.key),
                position: index + 1,
                siblings: shown.length,
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
    /** Identifies the document, so a different one does not inherit this one's state. */
    readonly documentUri: ComputedRef<string | undefined>;
    /** Keys the search is showing, or undefined when nothing is filtering (§11.5). */
    readonly visible?: ComputedRef<ReadonlySet<string> | undefined>;
}

/** What one `<file>` remembers while the user is looking at another. */
interface FileViewState {
    readonly expanded: ReadonlySet<string>;
    readonly focusedKey?: string;
}

const NOTHING_OPEN: FileViewState = { expanded: new Set() };

export function useTreeFlatten(source: TreeSource): TreeView {
    const byFile = ref(new Map<number, FileViewState>());
    const dismissedNoteFor = ref(new Set<number>());
    let statefulUri: string | undefined;

    const tree = computed(() => source.file.value?.tree ?? []);
    const fileIndex = computed(() => source.file.value?.index ?? -1);
    const state = computed(() => byFile.value.get(fileIndex.value) ?? NOTHING_OPEN);

    const rows = computed(() => flattenTree(tree.value, state.value.expanded, source.unitsById.value, source.visible?.value));
    const nodesByKey = computed(() => indexNodes(tree.value));
    const focusedKey = computed({
        get: () => state.value.focusedKey,
        set: key => write({ focusedKey: key }),
    });
    const focusedIndex = computed(() => rows.value.findIndex(row => row.key === focusedKey.value));

    const showFlatNote = computed(() => source.file.value?.hasAlIds === false
        && !dismissedNoteFor.value.has(source.file.value.index));

    /** Replaces the map rather than mutating it, so every reader sees the change. */
    function write(change: Partial<FileViewState>): void {
        const next = new Map(byFile.value);
        next.set(fileIndex.value, { ...state.value, ...change });
        byFile.value = next;
    }

    // A file seen for the first time opens to the configured depth. A re-parse of one
    // already seen keeps what was open — expansion keys are id prefixes, which survive it —
    // and so does switching away and back (`DEC-020`).
    //
    // A different *document* starts over. Its file indices collide with this one's while
    // meaning nothing to each other, so keeping the state would silently show a collapsed
    // tree whose expansion set names nodes that no longer exist.
    watch(
        () => [source.documentUri.value, fileIndex.value, tree.value] as const,
        ([uri, index, nodes]) => {
            if (uri !== statefulUri) {
                statefulUri = uri;
                byFile.value = new Map();
                dismissedNoteFor.value = new Set();
            }
            if (byFile.value.has(index)) {
                return;
            }
            const next = new Map(byFile.value);
            // The object-type level (`DEC-033`) sits above everything the setting was
            // written for, so it is paid for separately: `defaultExpandDepth: 1` opens the
            // objects it always opened, with their group above them.
            const grouped = nodes.some(node => node.group === true) ? 1 : 0;
            next.set(index, { expanded: new Set(keysToDepth(nodes, source.defaultExpandDepth.value + grouped)) });
            byFile.value = next;
        },
        // Synchronous: the expansion set and the rows must agree within one tick, or a
        // file switch renders a frame of the new tree under the old file's expansion.
        { immediate: true, flush: 'sync' },
    );

    function toggle(key: string): void {
        const next = new Set(state.value.expanded);
        if (!next.delete(key)) {
            next.add(key);
        }
        write({ expanded: next });
    }

    /** With a filter running, opens only what the filter shows — the rest is not there to open. */
    function expandAll(): void {
        const visible = source.visible?.value;
        const keys = expandableKeys(tree.value);
        write({ expanded: new Set(visible === undefined ? keys : keys.filter(key => visible.has(key))) });
    }

    function collapseAll(): void {
        write({ expanded: new Set() });
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
        dismissedNoteFor.value = new Set(dismissedNoteFor.value).add(fileIndex.value);
    }

    return {
        rows,
        nodesByKey,
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

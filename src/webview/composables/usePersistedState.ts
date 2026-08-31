import { onUnmounted, watch } from 'vue';

import { getState, setState } from '../vscode';

import type { ComputedRef } from 'vue';

/**
 * The view state §11.8 keeps across a hidden tab, through `vscode.setState`.
 *
 * This exists because `POLISH-03` also **removes `retainContextWhenHidden`** (`DEC-030`).
 * Without the flag a hidden tab's webview is destroyed and rebuilt from the host's cached
 * parse on reveal — quickly, measured at 36 ms — but at `defaultExpandDepth`, scrolled to
 * the top, with nothing focused. That is what this puts back.
 *
 * The composable is deliberately ignorant of *what* it is saving. It owns the slot, the
 * timing and the guard; `App.vue` owns the shape, because App is where the pieces are.
 */

/** Long enough that dragging a scrollbar writes once, short enough to survive a fast close. */
const WRITE_THROTTLE_MS = 250;

/**
 * The scroll position is a **row index**, not an offset.
 *
 * Pixels only mean something once the virtualiser has measured the rows above, which it
 * does lazily as they render — so a restored offset lands wherever the estimates happened
 * to put it. An index is exact whatever the measurement state, and it stays right across a
 * re-parse: the rows are rebuilt in document order under the expansion we restore first.
 */
export interface PersistedView {
    /** Whose state this is. A slot restored against another document is discarded. */
    readonly uri: string;
    readonly activeFileIndex: number;
    /** `<file>` index → the node keys open in it. */
    readonly expanded: Readonly<Record<string, readonly string[]>>;
    /** `<file>` index → the row the keyboard was on. */
    readonly focused: Readonly<Record<string, string>>;
    readonly firstVisibleRow: number;
    readonly query: string;
    readonly states: readonly string[];
    readonly editing: boolean;
}

export interface PersistedStateSource {
    /** Undefined until the first document arrives. */
    readonly uri: ComputedRef<string | undefined>;
    /** The state to save, or undefined while there is nothing worth saving. */
    snapshot: () => PersistedView | undefined;
    /** Applies a saved state. Anything it names that no longer exists is ignored. */
    restore: (state: PersistedView) => void;
}

export function usePersistedState(source: PersistedStateSource): void {
    // Read once, at setup, before anything can overwrite the slot — which is what makes the
    // restore safe whatever order the two watchers below happen to run in.
    const saved = read();
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Restored when the document it belongs to arrives, which for a custom editor happens
    // exactly once: the webview is per document, and a re-parse posts the same URI, so the
    // watcher does not fire again and cannot drag the reader back to where they started.
    watch(source.uri, (uri) => {
        if (uri !== undefined && saved?.uri === uri) {
            source.restore(saved);
        }
    }, { immediate: true });

    watch(source.snapshot, (state) => {
        if (state === undefined) {
            return;
        }
        if (timer !== undefined) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = undefined;
            setState(source.snapshot());
        }, WRITE_THROTTLE_MS);
    }, { deep: true });

    // A pending write would otherwise be lost exactly when it matters — the tab being
    // hidden is what unmounts the webview, and is the write this whole composable is for.
    onUnmounted(() => {
        if (timer !== undefined) {
            clearTimeout(timer);
            setState(source.snapshot());
        }
    });
}

/**
 * Whatever is in the slot, believed only as far as its shape allows.
 *
 * It was written by an older build of this extension, so every field is checked before it
 * is used. A slot that fails any of it is dropped rather than repaired: the cost is one
 * reveal at the default expansion, and the alternative is a half-restored view.
 */
function read(): PersistedView | undefined {
    const state = getState<unknown>();
    if (state === null || typeof state !== 'object') {
        return undefined;
    }
    const candidate = state as Partial<PersistedView>;
    if (typeof candidate.uri !== 'string' || typeof candidate.activeFileIndex !== 'number') {
        return undefined;
    }
    return {
        uri: candidate.uri,
        activeFileIndex: candidate.activeFileIndex,
        expanded: keysOf(candidate.expanded),
        focused: stringsOf(candidate.focused),
        firstVisibleRow: typeof candidate.firstVisibleRow === 'number' ? candidate.firstVisibleRow : 0,
        query: typeof candidate.query === 'string' ? candidate.query : '',
        states: Array.isArray(candidate.states) ? candidate.states.filter(each => typeof each === 'string') : [],
        editing: candidate.editing === true,
    };
}

function keysOf(value: unknown): Record<string, readonly string[]> {
    if (value === null || typeof value !== 'object') {
        return {};
    }
    const result: Record<string, readonly string[]> = {};
    for (const [index, keys] of Object.entries(value)) {
        if (Array.isArray(keys)) {
            result[index] = keys.filter(each => typeof each === 'string');
        }
    }
    return result;
}

function stringsOf(value: unknown): Record<string, string> {
    if (value === null || typeof value !== 'object') {
        return {};
    }
    const result: Record<string, string> = {};
    for (const [index, key] of Object.entries(value)) {
        if (typeof key === 'string') {
            result[index] = key;
        }
    }
    return result;
}

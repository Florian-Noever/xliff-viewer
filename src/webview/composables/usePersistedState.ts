import { onUnmounted, watch } from 'vue';

import { getState, setState } from '../vscode';

import type { ComputedRef } from 'vue';

/**
 * The view state kept across a hidden tab, through `vscode.setState`: a hidden tab's webview
 * is destroyed and rebuilt on reveal. This owns the slot, the timing and the guard; `App.vue`
 * decides what goes in it.
 */

/** Long enough that dragging a scrollbar writes once, short enough to survive a fast close. */
const WRITE_THROTTLE_MS = 250;

/** The scroll position is a **row index**: rows are measured lazily, so only an index restores exactly. */
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

    // Restored once, when its document arrives: a re-parse posts the same URI, so the
    // watcher does not fire again.
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

    // Hiding the tab unmounts the webview, so a pending write is made now.
    onUnmounted(() => {
        if (timer !== undefined) {
            clearTimeout(timer);
            setState(source.snapshot());
        }
    });
}

/**
 * Whatever is in the slot, believed only as far as its shape allows: an older build may have
 * written it. A slot without a URI and a file index is dropped; any other field that is not
 * what it should be falls back to its default.
 */
function read(): PersistedView | undefined {
    const state = getState();
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

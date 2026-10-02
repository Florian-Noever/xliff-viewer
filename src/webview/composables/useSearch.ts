import { computed, ref, watch } from 'vue';

import { escapeRegExp } from '@shared/escapeRegExp';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '@shared/dto';
import type { NodePredicate } from '../ancestorFilter';
import type { ComputedRef, Ref } from 'vue';

/**
 * Search over everything a unit carries, over the DTOs the webview already holds. The index
 * is built **once per tree**, not per keystroke.
 */

/** Long enough to swallow a fast typist's burst, short enough to feel like live filtering. */
const DEBOUNCE_MS = 120;

export interface Search {
    /** What the user typed, live. */
    readonly query: Ref<string>;
    /** What the filter is actually using — the query, one debounce behind. */
    readonly applied: ComputedRef<string>;
    readonly active: ComputedRef<boolean>;
    /**
     * Whether one node matches; undefined when nothing is typed, so the tree is left alone.
     * The state filter composes with it at the node.
     */
    readonly predicate: ComputedRef<NodePredicate | undefined>;
    /** Replaces what the user typed, as the search field does. */
    setQuery(query: string): void;
    clear(): void;
}

export interface SearchSource {
    readonly file: ComputedRef<XliffFileDto | undefined>;
    readonly unitsById: ComputedRef<ReadonlyMap<string, TransUnitDto>>;
}

/**
 * Separates the fields, so a query cannot match across two of them; XML text cannot contain
 * it. Written as an escape: a literal NUL makes text tools treat the file as binary.
 */
const FIELD_SEPARATOR = '\u0000';
/** What a `*` stands for: any run of characters short of the next field. */
const WITHIN_FIELD = `[^${FIELD_SEPARATOR}]*`;

/**
 * Everything about one node a query can match, lowercased and joined.
 *
 * A group node matches **nothing**, so a group shows only as the ancestor of a match.
 */
function haystack(node: AlNodeDto, unit: TransUnitDto | undefined): string {
    if (node.group === true) {
        return '';
    }

    const parts = [node.key, node.type, node.name ?? ''];

    if (unit !== undefined) {
        parts.push(unit.source, unit.target ?? '', unit.alObjectTarget ?? '', unit.developerHint ?? '');
        for (const note of unit.notes) {
            parts.push(note.value);
        }
    }

    return parts.join(FIELD_SEPARATOR).toLowerCase();
}

export function buildSearchIndex(
    nodes: readonly AlNodeDto[],
    unitsById: ReadonlyMap<string, TransUnitDto>,
    into = new Map<string, string>(),
): Map<string, string> {
    for (const node of nodes) {
        into.set(node.key, haystack(node, unitsById.get(node.key)));
        buildSearchIndex(node.children, unitsById, into);
    }
    return into;
}

/**
 * Turns a query into a test.
 *
 * `*` is the only wildcard, and it stays within one field. Everything else is a literal, so
 * a query full of `.` and `(` from a source string still finds it.
 */
export function toMatcher(query: string): (haystackText: string) => boolean {
    const needle = query.trim().toLowerCase();
    if (needle === '') {
        return () => true;
    }
    if (!needle.includes('*')) {
        return text => text.includes(needle);
    }

    const pattern = needle
        .split('*')
        .map(escapeRegExp)
        .join(WITHIN_FIELD);
    const expression = new RegExp(pattern, 's');
    return text => expression.test(text);
}

export function useSearch(source: SearchSource): Search {
    const query = ref('');
    const applied = ref('');
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Debounced, so a burst of typing filters once.
    watch(query, (next) => {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
        if (next.trim() === '') {
            applied.value = next;
            return;
        }
        timer = setTimeout(() => {
            timer = undefined;
            applied.value = next;
        }, DEBOUNCE_MS);
    });

    const index = computed(() => buildSearchIndex(source.file.value?.tree ?? [], source.unitsById.value));
    const active = computed(() => applied.value.trim() !== '');

    const predicate = computed<NodePredicate | undefined>(() => {
        if (!active.value) {
            return undefined;
        }
        const matcher = toMatcher(applied.value);
        const haystacks = index.value;
        return node => matcher(haystacks.get(node.key) ?? '');
    });

    function setQuery(value: string): void {
        query.value = value;
    }

    function clear(): void {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        query.value = '';
        applied.value = '';
    }

    return { query, applied: computed(() => applied.value), active, predicate, setQuery, clear };
}

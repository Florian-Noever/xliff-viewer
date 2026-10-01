import { computed, ref, watch } from 'vue';

import { escapeRegExp } from '@shared/escapeRegExp';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '@shared/dto';
import type { NodePredicate } from '../ancestorFilter';
import type { ComputedRef, Ref } from 'vue';

/**
 * Search over everything a unit carries.
 *
 * It runs in the webview over the DTOs already in memory — there is no round trip to the
 * host for a keystroke.
 *
 * The index is built **once per tree**, not per keystroke. Lowercasing every source,
 * target, name and note on every character typed is the obvious way to make a fast
 * search slow.
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
     * Whether one node matches. Undefined when nothing is typed, so the composition can
     * leave the tree alone rather than filter it with a predicate that says yes to all.
     *
     * A predicate rather than a finished visible-set, because the state filter composes
     * with it at the node — see `ancestorFilter.ts`.
     */
    readonly predicate: ComputedRef<NodePredicate | undefined>;
    clear(): void;
}

export interface SearchSource {
    readonly file: ComputedRef<XliffFileDto | undefined>;
    readonly unitsById: ComputedRef<ReadonlyMap<string, TransUnitDto>>;
}

/**
 * Written as an escape, not as the character itself: a literal NUL in a source file is
 * invisible to a reader, makes every text tool treat this file as binary, and survives no
 * whitespace-normalising step. It separates the fields so a query cannot match across the
 * seam between two of them, and XML text cannot contain one.
 */
const FIELD_SEPARATOR = '\u0000';
/** What a `*` stands for: any run of characters short of the next field. */
const WITHIN_FIELD = `[^${FIELD_SEPARATOR}]*`;

/**
 * Everything about one node a query can match, lowercased and joined.
 *
 * A group node matches **nothing**. It carries no translation, and matching it on its own
 * label would show a group whose children the filter then hides — a row that opens onto
 * nothing. It still appears whenever one of its objects matches, by the ancestor rule,
 * which is the behaviour a reader expects from typing a type name anyway.
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
 * `*` is the only wildcard, because it is the one people already type into VS Code's own
 * search boxes, and it stays within one field. Everything else is a literal, so a query
 * full of `.` and `(` from a source string still finds it.
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

    // Debounced so a fast typist filters once, not once per character. The work itself is
    // cheap — one pass over the index — so this is about wasted renders, not about latency.
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

    function clear(): void {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        query.value = '';
        applied.value = '';
    }

    return { query, applied: computed(() => applied.value), active, predicate, clear };
}

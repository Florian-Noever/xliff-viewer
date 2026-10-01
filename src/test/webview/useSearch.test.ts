import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, nextTick, ref } from 'vue';

import { buildSearchIndex, toMatcher, useSearch } from '../../webview/composables/useSearch';
import { flattenTree } from '../../webview/composables/useTreeFlatten';
import { visibleNodes } from '../../webview/ancestorFilter';
import { fileDto, nodeDto, unitDto } from '../support/dtoBuilders';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '../../shared/dto';
import type { Search, SearchSource } from '../../webview/composables/useSearch';

/**
 * Table 1 "PTE Contoso Methods Setup"
 *   Field 2 "Contoso Method"
 *     Property 3 "Caption"      → Contoso Method Name / Contoso Methoden Name
 *   Property 4 "ToolTip"        → The customer number / Die Kundennummer
 * Table 5 "PTE Other"
 *   Property 6 "Caption"        → Something else / Etwas anderes
 */
const TREE: AlNodeDto[] = [
    nodeDto('Table 1', [
        nodeDto('Table 1 - Field 2', [nodeDto('Table 1 - Field 2 - Property 3', [], { name: 'Caption' })], { name: 'Contoso Method' }),
        nodeDto('Table 1 - Property 4', [], { name: 'ToolTip' }),
    ], { name: 'PTE Contoso Methods Setup' }),
    nodeDto('Table 5', [nodeDto('Table 5 - Property 6', [], { name: 'Caption' })], { name: 'PTE Other' }),
];

const UNITS = new Map<string, TransUnitDto>([
    ['Table 1 - Field 2 - Property 3', unitDto('Table 1 - Field 2 - Property 3', { source: 'Contoso Method Name', target: 'Contoso Methoden Name', notes: [{ from: 'Developer', value: 'de-DE=Contoso Methoden Name' }] })],
    ['Table 1 - Property 4', unitDto('Table 1 - Property 4', { source: 'The customer number', target: 'Die Kundennummer' })],
    ['Table 5 - Property 6', unitDto('Table 5 - Property 6', { source: 'Something else', target: 'Etwas anderes' })],
]);

const FILE = fileDto({ tree: TREE, units: [...UNITS.values()] });

/**
 * Mounts the composable in a throwaway component — `useSearch` holds a `watch`, so it
 * needs a scope — and renders its predicate, so the computeds stay live.
 */
function mountSearch(source: SearchSource): Search {
    let captured: Search | undefined;
    mount(defineComponent({
        setup() {
            captured = useSearch(source);
            const search = captured;
            return () => String(search.predicate.value?.(TREE[0]) ?? '');
        },
    }));
    if (captured === undefined) {
        throw new Error('composable did not run');
    }
    return captured;
}

function searchIn(file: XliffFileDto = FILE): Search {
    const active = ref(file);
    return mountSearch({
        file: computed(() => active.value),
        unitsById: computed(() => new Map(active.value.units.map(each => [each.id, each]))),
    });
}

/** The query path is debounced; tests want the result, not the wait. */
async function type(search: Search, query: string): Promise<void> {
    search.query.value = query;
    await nextTick();
    vi.advanceTimersByTime(200);
    await nextTick();
}

const keysFor = (visible: ReadonlySet<string> | undefined): string[] =>
    flattenTree(TREE, new Set(), UNITS, visible).map(row => row.key);

const INDEX = buildSearchIndex(TREE, UNITS);

/** What the app composes: a query becomes one predicate over the index. */
const filterBy = (query: string) => visibleNodes(TREE, [node => toMatcher(query)(INDEX.get(node.key) ?? '')]);

const searchResult = (search: Search) => visibleNodes(
    TREE,
    [search.predicate.value].filter(each => each !== undefined),
);

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('the index is built once per document, not per keystroke', () => {
    /**
     * Counts index builds by counting reads of the tree they are built from. Lowercasing
     * every source, target, name and note per keystroke would make a fast search slow.
     */
    function countingSearch(shown = ref(FILE)) {
        const reads = { count: 0 };
        const counted = (file: XliffFileDto): XliffFileDto => ({
            ...file,
            get tree() {
                reads.count++;
                return file.tree;
            },
        });
        const search = mountSearch({
            file: computed(() => counted(shown.value)),
            unitsById: computed(() => UNITS),
        });
        return { search, reads, shown };
    }

    it('lowercases every unit once, however much is typed', async () => {
        const { search, reads } = countingSearch();

        await type(search, 'c');
        const afterFirst = reads.count;
        await type(search, 'co');
        await type(search, 'con');
        await type(search, 'contoso');

        expect(afterFirst).toBe(1);
        expect(reads.count).toBe(1);
    });

    it('rebuilds when the file it is indexing changes', async () => {
        const { search, reads, shown } = countingSearch();

        await type(search, 'contoso');
        expect(reads.count).toBe(1);

        shown.value = { ...FILE, index: 1 };
        await type(search, 'contoso');
        expect(reads.count).toBe(2);
    });
});

describe('the seam between two fields', () => {
    // Every field a node can match on is joined into one haystack. The separator is a NUL,
    // which XML text cannot contain and a search box cannot produce, so no query spans two.
    const seam = [nodeDto('Table 1 - Property 2', [], { name: 'Alpha' })];
    const seamUnits = new Map([['Table 1 - Property 2', unitDto('Table 1 - Property 2', { source: 'Beta', target: 'Gamma' })]]);
    const seamIndex = buildSearchIndex(seam, seamUnits);
    const matches = (query: string) => toMatcher(query)(seamIndex.get('Table 1 - Property 2') ?? '');

    it('matches within a field', () => {
        expect(matches('alpha')).toBe(true);
        expect(matches('beta')).toBe(true);
        expect(matches('gamma')).toBe(true);
    });

    it('does not match a phrase that spans two of them', () => {
        expect(matches('alpha beta')).toBe(false);
        expect(matches('alphabeta')).toBe(false);
        expect(matches('beta gamma')).toBe(false);
    });
});

describe('the object-type level', () => {
    const GROUPED: AlNodeDto[] = [{
        key: 'type:Table',
        type: 'Table',
        name: 'Tables (2)',
        group: true,
        children: TREE,
    }];

    const groupedIndex = buildSearchIndex(GROUPED, UNITS);

    it('never matches a group on its own label', () => {
        // A group that matched alone would render with every child filtered away — a row
        // that opens onto nothing. It rides in as an ancestor instead.
        expect(groupedIndex.get('type:Table')).toBe('');
        expect(toMatcher('tables')(groupedIndex.get('type:Table') ?? '')).toBe(false);
    });

    it('still indexes everything underneath it', () => {
        expect(groupedIndex.get('Table 1 - Field 2 - Property 3')).toContain('contoso method name');
        expect(groupedIndex.size).toBe(1 + INDEX.size);
    });

    it('shows the group when a unit under it matches, so the path is reachable', () => {
        const result = visibleNodes(GROUPED, [node => toMatcher('kundennummer')(groupedIndex.get(node.key) ?? '')]);

        expect(result?.visible.has('type:Table')).toBe(true);
        expect(result?.visible.has('Table 1')).toBe(true);
        expect(result?.visible.has('Table 1 - Property 4')).toBe(true);
        // The group is an ancestor, not a match: it is not what the count is counting.
        expect(result?.count).toBe(1);
    });

    it('opens the group in the flattened rows, not merely marks it visible', () => {
        const result = visibleNodes(GROUPED, [node => toMatcher('kundennummer')(groupedIndex.get(node.key) ?? '')]);
        const rows = flattenTree(GROUPED, new Set(), UNITS, result?.visible);

        expect(rows.map(row => row.key)).toEqual(['type:Table', 'Table 1', 'Table 1 - Property 4']);
        expect(rows[0].expanded).toBe(true);
    });

    it('still finds an object by its own type name, through its roots', () => {
        // "table" matches through every root's key and type, not through the group's label.
        const result = visibleNodes(GROUPED, [node => toMatcher('table')(groupedIndex.get(node.key) ?? '')]);

        expect(result?.visible.has('Table 1')).toBe(true);
        expect(result?.visible.has('type:Table')).toBe(true);
    });
});

describe('toMatcher', () => {
    it('matches anywhere, case-insensitively', () => {
        expect(toMatcher('CONTOSO')('a contoso b')).toBe(true);
        expect(toMatcher('missing')('a contoso b')).toBe(false);
    });

    it('treats * as the only wildcard', () => {
        expect(toMatcher('Conto*')('contoso method')).toBe(true);
        expect(toMatcher('Conto*Name')('contoso method name')).toBe(true);
        expect(toMatcher('Conto*Name')('contoso method')).toBe(false);
    });

    it('keeps a * within one field', () => {
        expect(toMatcher('conto*name')('contoso method name')).toBe(true);
        expect(toMatcher('conto*name')('contoso\u0000target name')).toBe(false);
    });

    it('keeps regex characters literal, so a source full of them is still findable', () => {
        expect(toMatcher('%1 = Document No.')('note: %1 = document no.')).toBe(true);
        expect(toMatcher('(x)')('a (x) b')).toBe(true);
        expect(toMatcher('a.c')('abc')).toBe(false);
    });

    it('matches everything for an empty query', () => {
        expect(toMatcher('   ')('anything')).toBe(true);
    });
});

describe('a wildcard query over the tree', () => {
    it('finds a unit one field of which holds the whole match, not one whose fields only share it', () => {
        const tree = [nodeDto('Table 7 - Field 8', [], { name: 'Contoso Rate' }), nodeDto('Table 7 - Field 9', [], { name: 'Discount' })];
        const units = new Map<string, TransUnitDto>([
            ['Table 7 - Field 8', unitDto('Table 7 - Field 8', { source: 'Rate', target: 'Name of the rate' })],
            ['Table 7 - Field 9', unitDto('Table 7 - Field 9', { source: 'Discount', target: 'Contoso Method Name' })],
        ]);
        const index = buildSearchIndex(tree, units);

        const found = visibleNodes(tree, [node => toMatcher('Contoso*Name')(index.get(node.key) ?? '')]);

        expect([...(found?.visible ?? [])]).toEqual(['Table 7 - Field 9']);
    });
});

describe('the index', () => {
    it('covers every text a unit carries', () => {
        const index = buildSearchIndex(TREE, UNITS);
        const leaf = index.get('Table 1 - Field 2 - Property 3') ?? '';

        expect(leaf).toContain('table 1 - field 2 - property 3'); // the id
        expect(leaf).toContain('property'); // the type
        expect(leaf).toContain('caption'); // the node name
        expect(leaf).toContain('contoso method name'); // source
        expect(leaf).toContain('contoso methoden name'); // target
        expect(leaf).toContain('de-de=contoso methoden name'); // the note
    });

    it('indexes containers as well as units', () => {
        expect(buildSearchIndex(TREE, UNITS).get('Table 1')).toContain('pte contoso methods setup');
    });

    it('has an entry for every node', () => {
        expect(buildSearchIndex(TREE, UNITS).size).toBe(6);
    });
});

describe('the ancestor rule', () => {
    it('shows a match and every ancestor of it', () => {
        const result = filterBy('Kundennummer');

        expect([...(result?.visible ?? [])].sort()).toEqual(['Table 1', 'Table 1 - Property 4']);
        expect(result?.count).toBe(1);
    });

    it('does not drag a matching container\'s whole subtree along', () => {
        // Searching an object name should not print every unit under it.
        expect([...(filterBy('PTE Other')?.visible ?? [])]).toEqual(['Table 5']);
    });

    it('finds nothing when nothing matches', () => {
        const result = filterBy('zzzz');

        expect(result?.visible.size).toBe(0);
        expect(result?.count).toBe(0);
    });

    it('counts every node that matched in its own right', () => {
        // "Contoso" is in the root's name, the field's name, and the leaf's texts.
        expect(filterBy('contoso')?.count).toBe(3);
    });

    it('leaves the tree alone when no predicate is active', () => {
        expect(visibleNodes(TREE, [])).toBeUndefined();
    });
});

describe('the filtered tree', () => {
    it('shows exactly the matches plus their ancestor chain', () => {
        expect(keysFor(filterBy('Kundennummer')?.visible)).toEqual(['Table 1', 'Table 1 - Property 4']);
    });

    it('opens ancestors regardless of what the user had expanded', () => {
        // Nothing is in the expansion set, yet the match three levels down is visible.
        expect(keysFor(filterBy('Methoden')?.visible)).toEqual([
            'Table 1',
            'Table 1 - Field 2',
            'Table 1 - Field 2 - Property 3',
        ]);
    });

    it('renumbers siblings so a filtered row still says where it is', () => {
        const rows = flattenTree(TREE, new Set(), UNITS, filterBy('Kundennummer')?.visible);

        expect(rows.map(row => `${row.position}/${row.siblings}`)).toEqual(['1/1', '1/1']);
    });

    it('is the whole tree again when nothing is filtering', () => {
        expect(keysFor(undefined)).toEqual(['Table 1', 'Table 5']);
    });
});

describe('useSearch', () => {
    it('does nothing until something is typed', () => {
        const search = searchIn();

        expect(search.active.value).toBe(false);
        expect(search.predicate.value).toBeUndefined();
        expect(searchResult(search)).toBeUndefined();
    });

    it('filters once the debounce has passed', async () => {
        const search = searchIn();

        search.query.value = 'Kundennummer';
        await nextTick();
        expect(search.predicate.value).toBeUndefined();

        vi.advanceTimersByTime(200);
        await nextTick();
        expect(searchResult(search)?.visible.size).toBe(2);
    });

    it('collapses a burst of typing into one filter', async () => {
        const search = searchIn();

        for (const query of ['K', 'Ku', 'Kun', 'Kunden']) {
            search.query.value = query;
            await nextTick();
            vi.advanceTimersByTime(20);
        }
        expect(search.predicate.value).toBeUndefined();

        vi.advanceTimersByTime(200);
        await nextTick();
        expect(search.applied.value).toBe('Kunden');
    });

    it('matches source, target, id, node name and note text', async () => {
        const search = searchIn();

        for (const [query, expected] of [
            ['Contoso Method Name', 'Table 1 - Field 2 - Property 3'],
            ['Die Kundennummer', 'Table 1 - Property 4'],
            ['Property 6', 'Table 5 - Property 6'],
            ['ToolTip', 'Table 1 - Property 4'],
            ['de-DE=Contoso', 'Table 1 - Field 2 - Property 3'],
        ] as const) {
            await type(search, query);
            expect(searchResult(search)?.visible.has(expected), query).toBe(true);
        }
    });

    it('supports a wildcard', async () => {
        const search = searchIn();

        await type(search, 'Conto*');

        expect(searchResult(search)?.count).toBe(3);
    });

    it('clears without waiting for the debounce', async () => {
        const search = searchIn();
        await type(search, 'Kunden');
        expect(search.active.value).toBe(true);

        search.clear();
        await nextTick();

        expect(search.active.value).toBe(false);
        expect(search.predicate.value).toBeUndefined();
        expect(search.query.value).toBe('');
    });

    it('empties immediately when the box is emptied, without a debounce', async () => {
        const search = searchIn();
        await type(search, 'Kunden');

        search.query.value = '';
        await nextTick();

        expect(search.active.value).toBe(false);
    });

    it('reports how many matched', async () => {
        const search = searchIn();

        await type(search, 'Caption');
        expect(searchResult(search)?.count).toBe(2);

        await type(search, 'zzzz');
        expect(searchResult(search)?.count).toBe(0);
        expect(searchResult(search)?.visible.size).toBe(0);
    });
});

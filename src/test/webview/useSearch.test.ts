import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, nextTick, ref } from 'vue';

import { buildSearchIndex, toMatcher, useSearch, visibleKeys } from '../../webview/composables/useSearch';
import { flattenTree } from '../../webview/composables/useTreeFlatten';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '../../shared/dto';
import type { Search } from '../../webview/composables/useSearch';

/**
 * Table 1 "PTE Contoso Methods Setup"
 *   Field 2 "Contoso Method"
 *     Property 3 "Caption"      → Contoso Method Name / Contoso Methoden Name
 *   Property 4 "ToolTip"        → The customer number / Die Kundennummer
 * Table 5 "PTE Other"
 *   Property 6 "Caption"        → Something else / Etwas anderes
 */
const TREE: AlNodeDto[] = [
    {
        key: 'Table 1',
        type: 'Table',
        name: 'PTE Contoso Methods Setup',
        children: [
            {
                key: 'Table 1 - Field 2',
                type: 'Field',
                name: 'Contoso Method',
                children: [{ key: 'Table 1 - Field 2 - Property 3', type: 'Property', name: 'Caption', children: [] }],
            },
            { key: 'Table 1 - Property 4', type: 'Property', name: 'ToolTip', children: [] },
        ],
    },
    {
        key: 'Table 5',
        type: 'Table',
        name: 'PTE Other',
        children: [{ key: 'Table 5 - Property 6', type: 'Property', name: 'Caption', children: [] }],
    },
];

const unit = (id: string, source: string, target: string, notes: { from?: string; value: string }[] = []): TransUnitDto =>
    ({ id, source, target, state: 'translated', translate: true, notes });

const UNITS = new Map<string, TransUnitDto>([
    ['Table 1 - Field 2 - Property 3', unit('Table 1 - Field 2 - Property 3', 'Contoso Method Name', 'Contoso Methoden Name', [{ from: 'Developer', value: 'de-DE=Contoso Methoden Name' }])],
    ['Table 1 - Property 4', unit('Table 1 - Property 4', 'The customer number', 'Die Kundennummer')],
    ['Table 5 - Property 6', unit('Table 5 - Property 6', 'Something else', 'Etwas anderes')],
]);

const FILE: XliffFileDto = {
    index: 0,
    sourceLanguage: 'en-US',
    targetLanguage: 'de-DE',
    tree: TREE,
    units: [...UNITS.values()],
    hasAlIds: true,
};

function searchIn(file: XliffFileDto = FILE): Search {
    let captured: Search | undefined;
    const active = ref(file);
    mount(defineComponent({
        setup() {
            captured = useSearch({
                file: computed(() => active.value),
                unitsById: computed(() => new Map(active.value.units.map(each => [each.id, each]))),
            });
            return () => null;
        },
    }));
    if (captured === undefined) {
        throw new Error('composable did not run');
    }
    return captured;
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

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
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

    it('keeps regex characters literal, so a source full of them is still findable', () => {
        expect(toMatcher('%1 = Document No.')('note: %1 = document no.')).toBe(true);
        expect(toMatcher('(x)')('a (x) b')).toBe(true);
        expect(toMatcher('a.c')('abc')).toBe(false);
    });

    it('matches everything for an empty query', () => {
        expect(toMatcher('   ')('anything')).toBe(true);
    });
});

describe('the index', () => {
    it('covers every text a unit carries (§11.5)', () => {
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

describe('visibleKeys', () => {
    const index = buildSearchIndex(TREE, UNITS);

    it('shows a match and every ancestor of it (§11.5)', () => {
        const { visible, count } = visibleKeys(TREE, index, toMatcher('Kundennummer'));

        expect([...visible].sort()).toEqual(['Table 1', 'Table 1 - Property 4']);
        expect(count).toBe(1);
    });

    it('does not drag a matching container\'s whole subtree along', () => {
        // Searching an object name should not print every unit under it.
        const { visible } = visibleKeys(TREE, index, toMatcher('PTE Other'));

        expect([...visible]).toEqual(['Table 5']);
    });

    it('finds nothing when nothing matches', () => {
        const { visible, count } = visibleKeys(TREE, index, toMatcher('zzzz'));

        expect(visible.size).toBe(0);
        expect(count).toBe(0);
    });

    it('counts every node that matched in its own right', () => {
        // "Contoso" is in the root's name, the field's name, and the leaf's texts.
        expect(visibleKeys(TREE, index, toMatcher('contoso')).count).toBe(3);
    });
});

describe('the filtered tree', () => {
    it('shows exactly the matches plus their ancestor chain', () => {
        const index = buildSearchIndex(TREE, UNITS);
        const { visible } = visibleKeys(TREE, index, toMatcher('Kundennummer'));

        expect(keysFor(visible)).toEqual(['Table 1', 'Table 1 - Property 4']);
    });

    it('opens ancestors regardless of what the user had expanded', () => {
        const index = buildSearchIndex(TREE, UNITS);
        const { visible } = visibleKeys(TREE, index, toMatcher('Methoden'));

        // Nothing is in the expansion set, yet the match three levels down is visible.
        expect(keysFor(visible)).toEqual([
            'Table 1',
            'Table 1 - Field 2',
            'Table 1 - Field 2 - Property 3',
        ]);
    });

    it('renumbers siblings so a filtered row still says where it is', () => {
        const index = buildSearchIndex(TREE, UNITS);
        const { visible } = visibleKeys(TREE, index, toMatcher('Kundennummer'));
        const rows = flattenTree(TREE, new Set(), UNITS, visible);

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
        expect(search.matches.value).toBeUndefined();
        expect(search.matchCount.value).toBe(0);
    });

    it('filters once the debounce has passed', async () => {
        const search = searchIn();

        search.query.value = 'Kundennummer';
        await nextTick();
        expect(search.matches.value).toBeUndefined();

        vi.advanceTimersByTime(200);
        await nextTick();
        expect(search.matches.value?.size).toBe(2);
    });

    it('collapses a burst of typing into one filter', async () => {
        const search = searchIn();

        for (const query of ['K', 'Ku', 'Kun', 'Kunden']) {
            search.query.value = query;
            await nextTick();
            vi.advanceTimersByTime(20);
        }
        expect(search.matches.value).toBeUndefined();

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
            expect(search.matches.value?.has(expected), query).toBe(true);
        }
    });

    it('supports a wildcard', async () => {
        const search = searchIn();

        await type(search, 'Conto*');

        expect(search.matchCount.value).toBe(3);
    });

    it('clears without waiting for the debounce', async () => {
        const search = searchIn();
        await type(search, 'Kunden');
        expect(search.active.value).toBe(true);

        search.clear();
        await nextTick();

        expect(search.active.value).toBe(false);
        expect(search.matches.value).toBeUndefined();
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
        expect(search.matchCount.value).toBe(2);

        await type(search, 'zzzz');
        expect(search.matchCount.value).toBe(0);
        expect(search.matches.value?.size).toBe(0);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';

import { useStateFilter } from '../../webview/composables/useStateFilter';
import { visibleNodes } from '../../webview/ancestorFilter';
import { summariseUnits, XliffState } from '../../shared/state';
import { stubLayout } from './support/layoutStub';
import { documentDto, fileDto, nodeDto, unitDto } from '../support/dtoBuilders';
import { rowNames, search } from './support/appUi';
import { mountApp } from './support/mountApp';
import { withSetup } from './support/withSetup';

import type { AlNodeDto } from '../../shared/dto';
import type { StateFilter } from '../../webview/composables/useStateFilter';

/**
 * Table 1 "Customer"
 *   Property 2  translated  "Kunde"
 *   Property 3  empty       "Vendor number"
 * Table 4 "Vendor"
 *   Property 5  needs-translation "Lieferant"
 *   Property 6  translated        "Kunde list"
 */
const TREE: AlNodeDto[] = [
    nodeDto('Table 1', [nodeDto('Table 1 - Property 2', [], { name: 'Caption' }), nodeDto('Table 1 - Property 3', [], { name: 'ToolTip' })], { name: 'Customer' }),
    nodeDto('Table 4', [nodeDto('Table 4 - Property 5', [], { name: 'Caption' }), nodeDto('Table 4 - Property 6', [], { name: 'ToolTip' })], { name: 'Vendor' }),
];

const UNITS = [
    unitDto('Table 1 - Property 2', { state: XliffState.translated, source: 'Kunde', target: 'Kunde' }),
    unitDto('Table 1 - Property 3', { state: XliffState.empty, source: 'Vendor number', target: '' }),
    unitDto('Table 4 - Property 5', { state: XliffState.needsTranslation, source: 'Lieferant', target: 'Lieferant' }),
    unitDto('Table 4 - Property 6', { state: XliffState.translated, source: 'Kunde list', target: 'Kunde list' }),
];

const DOCUMENT = documentDto([fileDto({ tree: TREE, units: UNITS })]);

const unitsById = new Map(UNITS.map(each => [each.id, each]));

const scope = ref('file:///w/App.de-DE.xlf#0');

function filterOnly(): StateFilter {
    return withSetup(() => useStateFilter({
        summary: computed(() => summariseUnits(UNITS)),
        unitsById: computed(() => unitsById),
        scope: computed(() => scope.value),
    })).result;
}

beforeEach(stubLayout);

beforeEach(() => {
    scope.value = 'file:///w/App.de-DE.xlf#0';
    vi.useFakeTimers();
});

describe('useStateFilter', () => {
    it('is off until a state is chosen — empty means everything, not nothing', () => {
        const filter = filterOnly();

        expect(filter.active.value).toBe(false);
        expect(filter.predicate.value).toBeUndefined();
    });

    it('offers one chip per state the file actually has, worst first', () => {
        const filter = filterOnly();

        expect(filter.chips.value.map(chip => chip.state)).toEqual([
            XliffState.empty,
            XliffState.needsTranslation,
            XliffState.translated,
        ]);
    });

    it('takes its counts from the roll-up, so a chip cannot disagree with the header', () => {
        const filter = filterOnly();
        const summary = summariseUnits(UNITS);

        for (const chip of filter.chips.value) {
            expect(chip.count, chip.state).toBe(summary.byState[chip.state]);
        }
    });

    it('toggles both ways and allows several at once', () => {
        const filter = filterOnly();

        filter.toggle(XliffState.empty);
        expect(filter.active.value).toBe(true);

        filter.toggle(XliffState.translated);
        expect(filter.selected.value.size).toBe(2);

        filter.toggle(XliffState.empty);
        expect([...filter.selected.value]).toEqual([XliffState.translated]);
    });

    it('matches only nodes carrying a unit of that state — containers ride in as ancestors', () => {
        const filter = filterOnly();
        filter.toggle(XliffState.empty);

        const result = visibleNodes(TREE, [filter.predicate.value].filter(each => each !== undefined));

        expect([...(result?.visible ?? [])].sort()).toEqual(['Table 1', 'Table 1 - Property 3']);
        expect(result?.count).toBe(1);
    });

    it('resets when the document or the file changes, since a state may not exist there', () => {
        const filter = filterOnly();
        filter.toggle(XliffState.empty);

        scope.value = 'file:///w/Other.xlf#0';

        expect(filter.active.value).toBe(false);
    });
});

describe('the chips in the toolbar', () => {
    it('are toggle buttons that say whether they are on', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        const chips = wrapper.findAll('.chip');
        expect(chips).toHaveLength(3);
        expect(chips[0].attributes('aria-pressed')).toBe('false');
        expect(chips[0].text()).toContain('empty');
        expect(chips[0].text()).toContain('1');

        await chips[0].trigger('click');

        expect(wrapper.findAll('.chip')[0].attributes('aria-pressed')).toBe('true');
    });

    it('narrows the tree to that state and its ancestors', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption', 'ToolTip']);

        await wrapper.findAll('.chip')[0].trigger('click'); // empty
        await nextTick();

        expect(rowNames(wrapper)).toEqual(['Customer', 'ToolTip']);
        expect(wrapper.get('.match-count').text()).toBe('1 matching');
    });

    it('restores the whole tree when the last chip is turned off', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        await wrapper.findAll('.chip')[0].trigger('click');
        await wrapper.findAll('.chip')[0].trigger('click');
        await nextTick();

        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption', 'ToolTip']);
        expect(wrapper.find('.match-count').exists()).toBe(false);
    });
});

describe('search and filter together', () => {
    it('shows only the units matching both', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        // "Kunde" matches two translated units; "Vendor number" is the empty one.
        await search(wrapper, 'Kunde');
        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'Vendor', 'ToolTip']);

        await wrapper.findAll('.chip').filter(chip => chip.text().includes('translated'))[0].trigger('click');
        await nextTick();

        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'Vendor', 'ToolTip']);

        // Now a state that no "Kunde" unit has: the intersection is empty, not the union.
        await wrapper.findAll('.chip').filter(chip => chip.text().includes('translated'))[0].trigger('click');
        await wrapper.findAll('.chip')[0].trigger('click'); // empty
        await nextTick();

        expect(rowNames(wrapper)).toEqual([]);
        expect(wrapper.get('.match-count').text()).toBe('no matches');
    });
});

describe('expand all and collapse all', () => {
    it('open and close the whole tree', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        await wrapper.findAll('.action')[1].trigger('click'); // collapse all
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Vendor']);

        await wrapper.findAll('.action')[0].trigger('click'); // expand all
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption', 'ToolTip']);
    });

    it('expand-all with a filter running opens only what the filter shows', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        await wrapper.findAll('.action')[1].trigger('click'); // collapse all first

        await wrapper.findAll('.chip')[0].trigger('click'); // empty — only under "Customer"
        await nextTick();
        await wrapper.findAll('.action')[0].trigger('click'); // expand all
        await nextTick();

        // The filter still decides what is on screen…
        expect(rowNames(wrapper)).toEqual(['Customer', 'ToolTip']);

        // …and when it clears, only the branch the filter had shown is open.
        await wrapper.findAll('.chip')[0].trigger('click');
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor']);
    });
});

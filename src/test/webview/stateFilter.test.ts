import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, nextTick, ref } from 'vue';

import App from '../../webview/App.vue';
import { useStateFilter } from '../../webview/composables/useStateFilter';
import { visibleNodes } from '../../webview/ancestorFilter';
import { ExtensionMessageType } from '../../shared/messages';
import { summariseUnits, XliffState } from '../../shared/state';
import { stubLayout } from './layoutStub';

import type { AlNodeDto, TransUnitDto, XliffDocumentDto } from '../../shared/dto';
import type { StateFilter } from '../../webview/composables/useStateFilter';

const unit = (id: string, state: XliffState, source: string, translate = true): TransUnitDto =>
    ({ id, source, target: state === XliffState.missing ? undefined : source, state, translate, notes: [] });

const node = (key: string, name: string, children: AlNodeDto[] = []): AlNodeDto =>
    ({ key, type: key.split(' ')[0], name, children });

/**
 * Table 1 "Customer"
 *   Property 2  translated  "Kunde"
 *   Property 3  empty       "Vendor number"
 * Table 4 "Vendor"
 *   Property 5  needs-translation "Lieferant"
 *   Property 6  translated        "Kunde list"
 */
const TREE: AlNodeDto[] = [
    node('Table 1', 'Customer', [node('Table 1 - Property 2', 'Caption'), node('Table 1 - Property 3', 'ToolTip')]),
    node('Table 4', 'Vendor', [node('Table 4 - Property 5', 'Caption'), node('Table 4 - Property 6', 'ToolTip')]),
];

const UNITS = [
    unit('Table 1 - Property 2', XliffState.translated, 'Kunde'),
    unit('Table 1 - Property 3', XliffState.empty, 'Vendor number'),
    unit('Table 4 - Property 5', XliffState.needsTranslation, 'Lieferant'),
    unit('Table 4 - Property 6', XliffState.translated, 'Kunde list'),
];

const DOCUMENT: XliffDocumentDto = {
    uri: 'file:///w/App.de-DE.xlf',
    fileName: 'App.de-DE.xlf',
    isBaseFile: false,
    readOnly: false,
    files: [{ index: 0, sourceLanguage: 'en-US', targetLanguage: 'de-DE', tree: TREE, units: UNITS, hasAlIds: true }],
};

const unitsById = new Map(UNITS.map(each => [each.id, each]));

function filterOnly(): StateFilter {
    let captured: StateFilter | undefined;
    mount(defineComponent({
        setup() {
            captured = useStateFilter({
                summary: computed(() => summariseUnits(UNITS)),
                unitsById: computed(() => unitsById),
                scope: computed(() => scope.value),
            });
            return () => null;
        },
    }));
    if (captured === undefined) {
        throw new Error('composable did not run');
    }
    return captured;
}

const scope = ref('file:///w/App.de-DE.xlf#0');

const mounted: { unmount(): void }[] = [];

function open() {
    const wrapper = mount(App, { attachTo: document.body });
    mounted.push(wrapper);
    window.dispatchEvent(new MessageEvent('message', {
        data: { type: ExtensionMessageType.setDocument, payload: DOCUMENT },
    }));
    return wrapper;
}

const rowNames = (wrapper: ReturnType<typeof open>): string[] =>
    wrapper.findAll('.tree-row .name').map(row => row.text());

let restore: () => void;

beforeEach(() => {
    scope.value = 'file:///w/App.de-DE.xlf#0';
    restore = stubLayout();
    vi.useFakeTimers();
});

afterEach(() => {
    for (const wrapper of mounted.splice(0)) {
        wrapper.unmount();
    }
    vi.useRealTimers();
    restore();
});

describe('useStateFilter', () => {
    it('is off until a state is chosen — empty means everything, not nothing', () => {
        const filter = filterOnly();

        expect(filter.active.value).toBe(false);
        expect(filter.predicate.value).toBeUndefined();
    });

    it('offers one chip per state the file actually has, worst first (§5.2)', () => {
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
    it('are toggle buttons that say whether they are on (§11.7)', async () => {
        const wrapper = open();
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
        const wrapper = open();
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption', 'ToolTip']);

        await wrapper.findAll('.chip')[0].trigger('click'); // empty
        await nextTick();

        expect(rowNames(wrapper)).toEqual(['Customer', 'ToolTip']);
        expect(wrapper.get('.match-count').text()).toBe('1 matching');
    });

    it('restores the whole tree when the last chip is turned off', async () => {
        const wrapper = open();
        await nextTick();

        await wrapper.findAll('.chip')[0].trigger('click');
        await wrapper.findAll('.chip')[0].trigger('click');
        await nextTick();

        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption', 'ToolTip']);
        expect(wrapper.find('.match-count').exists()).toBe(false);
    });
});

describe('search and filter together', () => {
    async function search(wrapper: ReturnType<typeof open>, query: string): Promise<void> {
        await wrapper.get('.search-input').setValue(query);
        vi.advanceTimersByTime(200);
        await nextTick();
    }

    it('shows only the units matching both (§11.5)', async () => {
        const wrapper = open();
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
        const wrapper = open();
        await nextTick();

        await wrapper.findAll('.action')[1].trigger('click'); // collapse all
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Vendor']);

        await wrapper.findAll('.action')[0].trigger('click'); // expand all
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption', 'ToolTip']);
    });

    it('expand-all with a filter running opens only what the filter shows', async () => {
        const wrapper = open();
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

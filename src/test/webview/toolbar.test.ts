import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, nextTick } from 'vue';

import Toolbar from '../../webview/components/Toolbar.vue';
import { useEditMode } from '../../webview/composables/useEditMode';
import { useSearch } from '../../webview/composables/useSearch';
import { useStateFilter } from '../../webview/composables/useStateFilter';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { summariseUnits } from '../../shared/state';
import { stubLayout } from './support/layoutStub';
import { documentDto, fileDto, nodeDto, unitDto } from '../support/dtoBuilders';
import { rowNames, search } from './support/appUi';
import { mountApp } from './support/mountApp';

const DOCUMENT = documentDto([fileDto({
    tree: [
        nodeDto('Table 1', [
            nodeDto('Table 1 - Property 2', [], { name: 'Caption' }),
            nodeDto('Table 1 - Property 3', [], { name: 'ToolTip' }),
        ], { name: 'Customer' }),
        nodeDto('Table 4', [nodeDto('Table 4 - Property 5', [], { name: 'Caption' })], { name: 'Vendor' }),
    ],
    units: [
        unitDto('Table 1 - Property 2', { source: 'Customer', target: 'Kunde' }),
        unitDto('Table 1 - Property 3', { source: 'The customer number', target: 'Die Kundennummer' }),
        unitDto('Table 4 - Property 5', { source: 'Vendor', target: 'Lieferant' }),
    ],
})]);

beforeEach(stubLayout);

beforeEach(() => {
    vi.useFakeTimers();
});

describe('the toolbar', () => {
    it('gives each toolbar its own count id, which its search field points at', () => {
        const [file] = DOCUMENT.files;
        const TwoToolbars = defineComponent({
            components: { Toolbar },
            setup() {
                const unitsById = computed(() => new Map(file.units.map(each => [each.id, each])));
                return {
                    search: useSearch({ file: computed(() => file), unitsById }),
                    filter: useStateFilter({ summary: computed(() => summariseUnits(file.units)), unitsById, scope: computed(() => 'one') }),
                    edit: useEditMode({ document: computed(() => DOCUMENT), settings: computed(() => DEFAULT_WEBVIEW_SETTINGS) }),
                };
            },
            template: '<Toolbar :search="search" :filter="filter" :edit="edit" :match-count="1" /><Toolbar :search="search" :filter="filter" :edit="edit" :match-count="2" />',
        });

        const wrapper = mount(TwoToolbars);
        const ids = wrapper.findAll('.match-count').map(count => count.attributes('id'));

        expect(new Set(ids).size).toBe(2);
        expect(wrapper.findAll('.search-input').map(input => input.attributes('aria-describedby'))).toEqual(ids);
    });

    it('appears only once a document has arrived', async () => {
        const empty = mountApp();
        expect(empty.find('.toolbar').exists()).toBe(false);

        const opened = mountApp(DOCUMENT);
        await nextTick();
        expect(opened.find('.toolbar').exists()).toBe(true);
    });

    it('has an accessible name for the search box', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        expect(wrapper.get('.search').text()).toContain('Search translation units');
        expect(wrapper.get('.search-input').attributes('type')).toBe('search');
    });

    it('says how many matched, and only while searching', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        expect(wrapper.find('.match-count').exists()).toBe(false);

        await search(wrapper, 'Kunde');
        expect(wrapper.get('.match-count').text()).toBe('2 matching');

        await search(wrapper, 'zzzz');
        expect(wrapper.get('.match-count').text()).toBe('no matches');
    });

    it('focuses the box on Ctrl+F', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
        await nextTick();

        expect(document.activeElement).toBe(wrapper.get('.search-input').element);
    });
});

describe('searching the tree', () => {
    it('shows the matches and their ancestors, and nothing else', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        expect(rowNames(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption']);

        await search(wrapper, 'Kundennummer');

        expect(rowNames(wrapper)).toEqual(['Customer', 'ToolTip']);
    });

    it('reaches a match through a collapsed ancestor', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        // Collapse everything the user can see first.
        for (const chevron of wrapper.findAll('.chevron')) {
            await chevron.trigger('click');
        }
        expect(rowNames(wrapper)).toEqual(['Customer', 'Vendor']);

        await search(wrapper, 'Lieferant');

        expect(rowNames(wrapper)).toEqual(['Vendor', 'Caption']);
    });

    it('restores the tree, and the expansion the user had, when the search is cleared', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        await wrapper.findAll('.chevron')[0].trigger('click'); // collapse "Customer"
        expect(rowNames(wrapper)).toEqual(['Customer', 'Vendor', 'Caption']);

        await search(wrapper, 'Kundennummer');
        expect(rowNames(wrapper)).toEqual(['Customer', 'ToolTip']);

        await wrapper.get('.search-input').trigger('keydown', { key: 'Escape' });
        await nextTick();

        // Exactly what it was before the search — the filter never touched the user's set.
        expect(rowNames(wrapper)).toEqual(['Customer', 'Vendor', 'Caption']);
        expect((wrapper.get('.search-input').element as HTMLInputElement).value).toBe('');
    });

    it('empties the tree when nothing matches, rather than showing everything', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        await search(wrapper, 'zzzz');

        expect(rowNames(wrapper)).toEqual([]);
    });
});

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, nextTick } from 'vue';

import App from '../../webview/App.vue';
import Toolbar from '../../webview/components/Toolbar.vue';
import { useEditMode } from '../../webview/composables/useEditMode';
import { useSearch } from '../../webview/composables/useSearch';
import { useStateFilter } from '../../webview/composables/useStateFilter';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { summariseUnits } from '../../shared/state';
import { ExtensionMessageType } from '../../shared/messages';
import { stubLayout } from './layoutStub';

import type { AlNodeDto, TransUnitDto, XliffDocumentDto } from '../../shared/dto';

const unit = (id: string, source: string, target: string): TransUnitDto =>
    ({ id, source, target, state: 'translated', translate: true, notes: [] });

const node = (key: string, type: string, name: string, children: AlNodeDto[] = []): AlNodeDto =>
    ({ key, type, name, children });

const DOCUMENT: XliffDocumentDto = {
    uri: 'file:///w/App.de-DE.xlf',
    fileName: 'App.de-DE.xlf',
    isBaseFile: false,
    readOnly: false,
    files: [{
        index: 0,
        sourceLanguage: 'en-US',
        targetLanguage: 'de-DE',
        hasAlIds: true,
        tree: [
            node('Table 1', 'Table', 'Customer', [
                node('Table 1 - Property 2', 'Property', 'Caption'),
                node('Table 1 - Property 3', 'Property', 'ToolTip'),
            ]),
            node('Table 4', 'Table', 'Vendor', [node('Table 4 - Property 5', 'Property', 'Caption')]),
        ],
        units: [
            unit('Table 1 - Property 2', 'Customer', 'Kunde'),
            unit('Table 1 - Property 3', 'The customer number', 'Die Kundennummer'),
            unit('Table 4 - Property 5', 'Vendor', 'Lieferant'),
        ],
    }],
};

function open() {
    // Attached to the document so focus assertions mean something.
    const wrapper = mount(App, { attachTo: document.body });
    window.dispatchEvent(new MessageEvent('message', {
        data: { type: ExtensionMessageType.setDocument, payload: DOCUMENT },
    }));
    return wrapper;
}

async function search(wrapper: ReturnType<typeof open>, query: string): Promise<void> {
    await wrapper.get('.search-input').setValue(query);
    vi.advanceTimersByTime(200);
    await nextTick();
}

const rowKeys = (wrapper: ReturnType<typeof open>): string[] =>
    wrapper.findAll('.tree-row .name, .tree-row .legend-name').map(row => row.text());

let restore: () => void;

beforeEach(() => {
    restore = stubLayout();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    restore();
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
        const empty = mount(App);
        expect(empty.find('.toolbar').exists()).toBe(false);

        const opened = open();
        await nextTick();
        expect(opened.find('.toolbar').exists()).toBe(true);
    });

    it('has an accessible name for the search box', async () => {
        const wrapper = open();
        await nextTick();

        expect(wrapper.get('.search').text()).toContain('Search translation units');
        expect(wrapper.get('.search-input').attributes('type')).toBe('search');
    });

    it('says how many matched, and only while searching', async () => {
        const wrapper = open();
        await nextTick();
        expect(wrapper.find('.match-count').exists()).toBe(false);

        await search(wrapper, 'Kunde');
        expect(wrapper.get('.match-count').text()).toBe('2 matching');

        await search(wrapper, 'zzzz');
        expect(wrapper.get('.match-count').text()).toBe('no matches');
    });

    it('focuses the box on Ctrl+F', async () => {
        const wrapper = open();
        await nextTick();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
        await nextTick();

        expect(document.activeElement).toBe(wrapper.get('.search-input').element);
    });
});

describe('searching the tree', () => {
    it('shows the matches and their ancestors, and nothing else', async () => {
        const wrapper = open();
        await nextTick();
        expect(rowKeys(wrapper)).toEqual(['Customer', 'Caption', 'ToolTip', 'Vendor', 'Caption']);

        await search(wrapper, 'Kundennummer');

        expect(rowKeys(wrapper)).toEqual(['Customer', 'ToolTip']);
    });

    it('reaches a match through a collapsed ancestor', async () => {
        const wrapper = open();
        await nextTick();
        // Collapse everything the user can see first.
        for (const chevron of wrapper.findAll('.chevron')) {
            await chevron.trigger('click');
        }
        expect(rowKeys(wrapper)).toEqual(['Customer', 'Vendor']);

        await search(wrapper, 'Lieferant');

        expect(rowKeys(wrapper)).toEqual(['Vendor', 'Caption']);
    });

    it('restores the tree, and the expansion the user had, when the search is cleared', async () => {
        const wrapper = open();
        await nextTick();
        await wrapper.findAll('.chevron')[0].trigger('click'); // collapse "Customer"
        expect(rowKeys(wrapper)).toEqual(['Customer', 'Vendor', 'Caption']);

        await search(wrapper, 'Kundennummer');
        expect(rowKeys(wrapper)).toEqual(['Customer', 'ToolTip']);

        await wrapper.get('.search-input').trigger('keydown', { key: 'Escape' });
        await nextTick();

        // Exactly what it was before the search — the filter never touched the user's set.
        expect(rowKeys(wrapper)).toEqual(['Customer', 'Vendor', 'Caption']);
        expect((wrapper.get('.search-input').element as HTMLInputElement).value).toBe('');
    });

    it('empties the tree when nothing matches, rather than showing everything', async () => {
        const wrapper = open();
        await nextTick();

        await search(wrapper, 'zzzz');

        expect(rowKeys(wrapper)).toEqual([]);
    });
});

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, nextTick, ref } from 'vue';

import UnitTree from '../../webview/components/UnitTree.vue';
import { useTreeFlatten } from '../../webview/composables/useTreeFlatten';

import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { summariseTree } from '../../shared/state';
import { stubLayout, STUB_ROW_HEIGHT as ROW } from './layoutStub';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '../../shared/dto';
import type { WebviewSettings } from '../../shared/settings';
import type { StateSummary } from '../../shared/state';
import type { TreeView } from '../../webview/composables/useTreeFlatten';

/** `roots` objects, each with `members` children — the shape the corpus actually has. */
function bigTree(roots: number, members: number): { tree: AlNodeDto[]; units: Map<string, TransUnitDto> } {
    const units = new Map<string, TransUnitDto>();
    const tree = Array.from({ length: roots }, (_unused, object) => {
        const key = `Table ${object}`;
        const children = Array.from({ length: members }, (_ignored, member) => {
            const childKey = `${key} - Property ${member}`;
            units.set(childKey, { id: childKey, source: `source ${member}`, state: 'translated', translate: true, notes: [] });
            return { key: childKey, type: 'Property', name: `Caption ${member}`, children: [] };
        });
        return { key, type: 'Table', name: `Object ${object}`, children };
    });
    return { tree, units };
}

function mountTree(
    tree: AlNodeDto[],
    units: Map<string, TransUnitDto>,
    depth = 1,
    hasAlIds = true,
    summaries?: ReadonlyMap<string, StateSummary>,
    settings?: WebviewSettings,
) {
    const file = ref<XliffFileDto>({
        index: 0,
        sourceLanguage: 'en-US',
        targetLanguage: 'de-DE',
        tree,
        units: [...units.values()],
        hasAlIds,
    });
    let view: TreeView | undefined;

    const wrapper = mount(defineComponent({
        components: { UnitTree },
        setup() {
            const created = useTreeFlatten({
                file: computed(() => file.value),
                unitsById: computed(() => units),
                defaultExpandDepth: computed(() => depth),
                documentUri: computed(() => 'file:///w/one.xlf'),
            });
            view = created;
            return { tree: created, summaries, settings };
        },
        template: '<UnitTree :tree="tree" :summaries="summaries" :settings="settings" />',
    }), { attachTo: document.body });

    if (view === undefined) {
        throw new Error('composable did not run');
    }
    return { wrapper, view, file };
}

let restore: () => void;

beforeEach(() => {
    restore = stubLayout();
});

afterEach(() => {
    restore();
});

describe('virtualisation', () => {
    it('renders a window over 2500 units, not all of them', async () => {
        const { wrapper, view } = mountTree(...Object.values(bigTree(230, 11)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        expect(view.rows.value.length).toBe(230 + 230 * 11);

        const rendered = wrapper.findAll('.tree-row').length;
        expect(rendered).toBeGreaterThan(0);
        // A viewport of 600px over 24px rows is 25 rows, plus overscan at both edges.
        expect(rendered).toBeLessThan(60);
    });

    it('reserves the full scroll height, so the scrollbar tells the truth', async () => {
        const { wrapper, view } = mountTree(...Object.values(bigTree(230, 11)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        const height = Number.parseInt(wrapper.get('.spacer').attributes('style')?.match(/height:\s*(\d+)/)?.[1] ?? '0', 10);

        expect(height).toBe(view.rows.value.length * ROW);
    });

    it('grows the rendered window no further when the tree grows', async () => {
        const small = mountTree(...Object.values(bigTree(10, 4)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();
        const large = mountTree(...Object.values(bigTree(230, 11)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        expect(large.wrapper.findAll('.tree-row').length)
            .toBeLessThanOrEqual(small.wrapper.findAll('.tree-row').length + 1);
    });
});

describe('the rows it renders', () => {
    it('is a real ARIA tree (§11.7)', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(3, 2)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        expect(wrapper.get('[role="tree"]').attributes('aria-label')).toBe('Translation units');
        const rows = wrapper.findAll('[role="treeitem"]');
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].attributes('aria-level')).toBe('1');
        expect(rows[0].attributes('aria-expanded')).toBe('true');
        expect(rows[0].attributes('aria-posinset')).toBe('1');
        expect(rows[0].attributes('aria-setsize')).toBe('3');
    });

    it('gives a child the level below its parent, and no aria-expanded of its own', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(2, 2)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        const child = wrapper.findAll('[role="treeitem"]')[1];

        expect(child.attributes('aria-level')).toBe('2');
        expect(child.attributes('aria-expanded')).toBeUndefined();
    });

    it('shows the type and the name on a container row', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(1, 1)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        expect(wrapper.get('.tree-row .type').text()).toBe('Table');
        expect(wrapper.get('.tree-row .name').text()).toBe('Object 0');
        expect(wrapper.get('.tree-row').find('.unit-card').exists()).toBe(false);
    });

    it('leaves a unit row without a card until it is given settings to render one with', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(1, 1)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        expect(wrapper.findAll('.tree-row')[1].find('.unit-card').exists()).toBe(false);
    });

    it('offers a chevron only where there is something to open', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(1, 1)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        const rows = wrapper.findAll('.tree-row');

        expect(rows[0].find('.chevron').exists()).toBe(true);
        expect(rows[1].find('.chevron').exists()).toBe(false);
        expect(rows[0].get('.chevron').attributes('aria-label')).toBe('Collapse Object 0');
    });

    it('collapses when its chevron is pressed', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(2, 3)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();
        expect(wrapper.findAll('.tree-row').length).toBe(8);

        await wrapper.get('.chevron').trigger('click');

        expect(wrapper.findAll('.tree-row').length).toBe(5);
    });
});

describe('keyboard (§11.7)', () => {
    async function focused(wrapper: ReturnType<typeof mountTree>['wrapper']): Promise<string> {
        await nextTick();
        return wrapper.find('.tree-row.is-focused').exists() ? wrapper.get('.tree-row.is-focused .name').text() : 'none';
    }

    it('moves down and up', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(2, 2)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        const tree = wrapper.get('[role="tree"]');

        await tree.trigger('keydown', { key: 'ArrowDown' });
        expect(await focused(wrapper)).toBe('Object 0');

        await tree.trigger('keydown', { key: 'ArrowDown' });
        expect(await focused(wrapper)).toBe('Caption 0');

        await tree.trigger('keydown', { key: 'ArrowUp' });
        expect(await focused(wrapper)).toBe('Object 0');
    });

    it('opens with →, closes with ←, and steps out of a leaf', async () => {
        const { wrapper, view } = mountTree(...Object.values(bigTree(2, 2)) as [AlNodeDto[], Map<string, TransUnitDto>], 0);
        const tree = wrapper.get('[role="tree"]');

        await tree.trigger('keydown', { key: 'ArrowDown' });
        await tree.trigger('keydown', { key: 'ArrowRight' });
        expect(view.rows.value).toHaveLength(4);

        await tree.trigger('keydown', { key: 'ArrowRight' });
        expect(await focused(wrapper)).toBe('Caption 0');

        await tree.trigger('keydown', { key: 'ArrowLeft' });
        expect(await focused(wrapper)).toBe('Object 0');

        await tree.trigger('keydown', { key: 'ArrowLeft' });
        expect(view.rows.value).toHaveLength(2);
    });

    it('toggles with Enter', async () => {
        const { wrapper, view } = mountTree(...Object.values(bigTree(2, 2)) as [AlNodeDto[], Map<string, TransUnitDto>], 0);
        const tree = wrapper.get('[role="tree"]');

        await tree.trigger('keydown', { key: 'ArrowDown' });
        await tree.trigger('keydown', { key: 'Enter' });

        expect(view.rows.value).toHaveLength(4);
    });

    it('jumps to both ends', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(3, 1)) as [AlNodeDto[], Map<string, TransUnitDto>], 0);
        const tree = wrapper.get('[role="tree"]');

        await tree.trigger('keydown', { key: 'End' });
        expect(await focused(wrapper)).toBe('Object 2');

        await tree.trigger('keydown', { key: 'Home' });
        expect(await focused(wrapper)).toBe('Object 0');
    });

    it('leaves keys it does not own alone', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(2, 2)) as [AlNodeDto[], Map<string, TransUnitDto>]);

        await wrapper.get('[role="tree"]').trigger('keydown', { key: 'a' });

        expect(await focused(wrapper)).toBe('none');
    });
});

describe('what a row click means (UI-05)', () => {
    /** A node that carries a unit *and* children: an id can be another unit's prefix. */
    function treeWithBoth(): { tree: AlNodeDto[]; units: Map<string, TransUnitDto> } {
        const units = new Map<string, TransUnitDto>();
        units.set('Table 0', { id: 'Table 0', source: 'Object source', state: 'translated', translate: true, notes: [] });
        units.set('Table 0 - Property 0', { id: 'Table 0 - Property 0', source: 'Leaf source', state: 'translated', translate: true, notes: [] });
        const tree: AlNodeDto[] = [{
            key: 'Table 0',
            type: 'Table',
            name: 'Object 0',
            children: [{ key: 'Table 0 - Property 0', type: 'Property', name: 'Caption 0', children: [] }],
        }];
        return { tree, units };
    }

    it('marks only the rows that have something to open', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(1, 1)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        const rows = wrapper.findAll('.tree-row');

        expect(rows[0].classes()).toContain('is-container');
        expect(rows[1].classes()).not.toContain('is-container');
    });

    it('collapses a container when the row itself is clicked, not only its chevron', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(2, 3)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();
        expect(wrapper.findAll('.tree-row').length).toBe(8);

        await wrapper.findAll('.tree-row')[0].trigger('click');

        expect(wrapper.findAll('.tree-row').length).toBe(5);
    });

    it('expands it again on the next click', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(1, 3)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        await wrapper.findAll('.tree-row')[0].trigger('click');
        expect(wrapper.findAll('.tree-row').length).toBe(1);

        await wrapper.findAll('.tree-row')[0].trigger('click');
        expect(wrapper.findAll('.tree-row').length).toBe(4);
    });

    it('leaves the keyboard where the mouse put it, so the arrow keys carry on from there', async () => {
        const { wrapper, view } = mountTree(...Object.values(bigTree(3, 1)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        await wrapper.findAll('.tree-row')[2].trigger('click');

        expect(view.focusedKey.value).toBe('Table 1');
    });

    it('does nothing at all when a unit row is clicked', async () => {
        const { wrapper, view } = mountTree(...Object.values(bigTree(1, 2)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();
        const before = wrapper.findAll('.tree-row').length;

        await wrapper.findAll('.tree-row')[1].trigger('click');

        expect(wrapper.findAll('.tree-row').length).toBe(before);
        expect(view.focusedKey.value).toBeUndefined();
    });

    it('toggles once when the chevron is pressed, not twice', async () => {
        // The chevron sits inside the row it toggles; without `.stop` the row handler runs too
        // and puts it straight back.
        const { wrapper } = mountTree(...Object.values(bigTree(1, 3)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        await wrapper.get('.chevron').trigger('click');

        expect(wrapper.findAll('.tree-row').length).toBe(1);
    });

    it('does not fold a row because the reader clicked inside its unit card', async () => {
        const { tree, units } = treeWithBoth();
        const { wrapper } = mountTree(tree, units, 1, true, undefined, DEFAULT_WEBVIEW_SETTINGS);
        await nextTick();
        expect(wrapper.findAll('.tree-row').length).toBe(2);

        await wrapper.get('.tree-row .card .source').trigger('click');

        expect(wrapper.findAll('.tree-row').length).toBe(2);
    });

    it('does not fold a row at the end of a drag that selected text', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(1, 3)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        const range = document.createRange();
        range.selectNodeContents(wrapper.get('.tree-row .name').element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        await wrapper.findAll('.tree-row')[0].trigger('click');

        expect(wrapper.findAll('.tree-row').length).toBe(4);
        selection?.removeAllRanges();
    });
});

describe('state on the rows (UI-03)', () => {
    it('shows a unit its own state and a container its roll-up', async () => {
        const { tree, units } = bigTree(1, 2);
        const summaries = summariseTree(tree, units);
        const { wrapper } = mountTree(tree, units, 1, true, summaries);
        await nextTick();

        const rows = wrapper.findAll('.tree-row');

        expect(rows[0].find('.progress').exists()).toBe(true);
        expect(rows[0].get('.counts').text()).toBe('2/2');
        expect(rows[1].find('.progress').exists()).toBe(false);
        expect(rows[1].get('.state-badge').text()).toBe('translated');
    });

    it('shows no bar on a container until its summary arrives', async () => {
        const { tree, units } = bigTree(1, 2);
        const { wrapper } = mountTree(tree, units);
        await nextTick();

        expect(wrapper.find('.progress').exists()).toBe(false);
    });
});

describe('the flat-list note (DEC-022)', () => {
    it('explains why there is no tree, and goes away when dismissed', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(2, 0)) as [AlNodeDto[], Map<string, TransUnitDto>], 1, false);
        await nextTick();

        expect(wrapper.get('[role="note"]').text()).toContain('no AL object structure');

        await wrapper.get('.dismiss').trigger('click');

        expect(wrapper.find('[role="note"]').exists()).toBe(false);
        expect(wrapper.findAll('.tree-row').length).toBe(2);
    });

    it('stays away for an AL file', async () => {
        const { wrapper } = mountTree(...Object.values(bigTree(2, 1)) as [AlNodeDto[], Map<string, TransUnitDto>]);
        await nextTick();

        expect(wrapper.find('[role="note"]').exists()).toBe(false);
    });
});

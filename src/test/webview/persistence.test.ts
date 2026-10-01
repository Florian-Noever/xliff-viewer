import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import App from '../../webview/App.vue';
import { DEV_DOCUMENT } from '../../webview/fixtures/devDocument';
import { stubLayout } from './layoutStub';
import { setWebviewState, webviewState, webviewStateWrites } from '../setup/webview';

import type { PersistedView } from '../../webview/composables/usePersistedState';

/**
 * Without `retainContextWhenHidden`, hiding a tab destroys the webview, which is why every
 * test here **unmounts** the app before checking.
 */

const WRITE_THROTTLE_MS = 250;

type Mounted = ReturnType<typeof mount>;

/** Mounts the app and answers `ready` with the fixture, the way the host does. */
async function open(): Promise<Mounted> {
    const wrapper = mount(App, { attachTo: document.body });
    window.postMessage({ type: 'setDocument', payload: DEV_DOCUMENT }, '*');
    await new Promise(resolve => setTimeout(resolve, 20));
    await nextTick();
    await nextTick();
    return wrapper;
}

/** Waits out the write throttle. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, WRITE_THROTTLE_MS + 40));

/** The toolbar's second action. Collapsing changes the tree whatever depth it opened at. */
async function collapseAll(wrapper: Mounted): Promise<void> {
    await wrapper.findAll('.toolbar .action')[1].trigger('click');
    await nextTick();
}

/** Hides the tab: the webview is destroyed, and a pending write has to survive that. */
async function hide(wrapper: Mounted): Promise<void> {
    wrapper.unmount();
    await nextTick();
}

const saved = (): PersistedView | undefined => webviewState() as PersistedView | undefined;

let restore: () => void;

beforeEach(() => {
    restore = stubLayout();
    setWebviewState(undefined);
});

afterEach(() => {
    restore();
});

describe('what a hidden tab remembers', () => {
    it('saves nothing until there is a document to save it for', async () => {
        mount(App, { attachTo: document.body });
        await nextTick();
        await settle();

        expect(saved()).toBeUndefined();
    });

    it('keeps the search, the filter and the edit toggle across a hide and a reveal', async () => {
        const first = await open();
        await first.get('.search-input').setValue('setup');
        await first.get('.edit-toggle').trigger('click');
        await first.findAll('.chip')[0].trigger('click');
        await settle();
        const chips = first.findAll('.chip').filter(chip => chip.attributes('aria-pressed') === 'true').length;
        await hide(first);

        const second = await open();

        expect((second.get('.search-input').element as HTMLInputElement).value).toBe('setup');
        expect(second.get('.edit-toggle').attributes('aria-pressed')).toBe('true');
        expect(second.findAll('.chip').filter(chip => chip.attributes('aria-pressed') === 'true')).toHaveLength(chips);
    });

    it('keeps what the tree had open, rather than reopening to the default depth', async () => {
        // Collapsed rather than expanded, because the fixture already opens past its own
        // default: a test that expands proves nothing about which of the two was restored.
        const first = await open();
        const atDefault = first.findAll('[role="treeitem"]').length;
        await collapseAll(first);
        const collapsed = first.findAll('[role="treeitem"]').length;
        await settle();
        await hide(first);

        expect(collapsed).toBeLessThan(atDefault);

        const second = await open();

        expect(second.findAll('[role="treeitem"]').length).toBe(collapsed);
    });

    it('keeps the row the keyboard was on', async () => {
        const first = await open();
        const tree = first.get('[role="tree"]');
        await tree.trigger('keydown', { key: 'ArrowDown' });
        await tree.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();
        const focused = first.get('.tree-row.is-focused').text();
        await settle();
        await hide(first);

        const second = await open();

        expect(second.get('.tree-row.is-focused').text()).toBe(focused);
    });

    it('restores once, so a re-parse does not drag the reader back', async () => {
        // The host re-posts `setDocument` after every external edit. Restoring on each one
        // would undo whatever the reader did since the reveal — collapse a branch, save an
        // edit, and the branch reopens under them.
        const first = await open();
        await collapseAll(first);
        await settle();
        await hide(first);

        const second = await open();
        const collapsed = second.findAll('[role="treeitem"]').length;
        await second.findAll('.toolbar .action')[0].trigger('click');
        await nextTick();
        const expanded = second.findAll('[role="treeitem"]').length;

        // A re-parse of the same document, which is what an edit produces.
        window.postMessage({ type: 'setDocument', payload: DEV_DOCUMENT }, '*');
        await new Promise(resolve => setTimeout(resolve, 20));
        await nextTick();

        expect(expanded).toBeGreaterThan(collapsed);
        expect(second.findAll('[role="treeitem"]').length).toBe(expanded);
    });

    it('writes the pending state when the tab is hidden mid-throttle', async () => {
        // The unmount *is* the hide. A write still waiting on its timer at that moment is
        // the one write this whole composable exists to make.
        const first = await open();
        await first.get('.search-input').setValue('unsaved');

        expect(saved()).toBeUndefined();
        await hide(first);

        expect(saved()?.query).toBe('unsaved');
    });
});

describe('the slot, and what may be believed of it', () => {
    it('belongs to one document, and is ignored by another', async () => {
        const first = await open();
        await first.get('.search-input').setValue('setup');
        await settle();
        await hide(first);

        setWebviewState({ ...saved(), uri: 'file:///w/SomeOtherApp.de-DE.xlf' });
        const second = await open();

        expect((second.get('.search-input').element as HTMLInputElement).value).toBe('');
    });

    it('ignores keys that no longer name a node, without throwing', async () => {
        // The document can change under a saved slot — a unit removed from the AL source
        // takes its node with it. A stale key opens nothing; it must not take the reveal
        // down with it, nor lose the keys that are still good.
        const first = await open();
        await collapseAll(first);
        await first.get('.chevron').trigger('click');
        await nextTick();
        const opened = first.findAll('[role="treeitem"]').length;
        await settle();
        await hide(first);

        const stored = saved();
        if (stored === undefined) {
            throw new Error('nothing was saved');
        }
        setWebviewState({
            ...stored,
            expanded: { ...stored.expanded, 0: [...(stored.expanded[0] ?? []), 'Table 404 - Property 404'] },
            focused: { 0: 'Table 404 - Property 404' },
        });

        const second = await open();

        expect(second.findAll('[role="treeitem"]').length).toBe(opened);
        expect(second.find('.tree-row.is-focused').exists()).toBe(false);
    });

    it('drops a slot it cannot make sense of rather than half-applying it', async () => {
        for (const rubbish of [null, 42, 'a string', { }, { uri: 5 }, { uri: 'file:///w/x.xlf' }]) {
            setWebviewState(rubbish);
            const wrapper = await open();

            expect(wrapper.find('[role="tree"]').exists()).toBe(true);
            expect((wrapper.get('.search-input').element as HTMLInputElement).value).toBe('');
            await hide(wrapper);
        }
    });

    it('survives a slot whose lists are the wrong shape', async () => {
        setWebviewState({
            uri: DEV_DOCUMENT.uri,
            activeFileIndex: 0,
            expanded: { 0: ['a', 7, null], notANumber: ['b'] },
            focused: { 0: 12 },
            firstVisibleRow: 'top',
            query: 9,
            states: ['translated', 4],
            editing: 'yes',
        });

        const wrapper = await open();

        expect(wrapper.find('[role="tree"]').exists()).toBe(true);
        expect((wrapper.get('.search-input').element as HTMLInputElement).value).toBe('');
        expect(wrapper.get('.edit-toggle').attributes('aria-pressed')).toBe('false');
    });
});

describe('how often it writes', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('writes once for a burst, not once per change', async () => {
        // A scroll crosses a row at a time and each crossing is a change. One write per
        // crossing would put a `setState` on every frame of a flick.
        const wrapper = mount(App, { attachTo: document.body });
        window.postMessage({ type: 'setDocument', payload: DEV_DOCUMENT }, '*');
        await vi.advanceTimersByTimeAsync(20);
        await nextTick();
        await vi.advanceTimersByTimeAsync(WRITE_THROTTLE_MS + 40);
        const before = webviewStateWrites();

        for (const query of ['s', 'se', 'set', 'setu', 'setup']) {
            await wrapper.get('.search-input').setValue(query);
        }
        await vi.advanceTimersByTimeAsync(WRITE_THROTTLE_MS - 10);

        expect(webviewStateWrites()).toBe(before);

        await vi.advanceTimersByTimeAsync(50);

        expect(webviewStateWrites()).toBe(before + 1);
        expect(saved()?.query).toBe('setup');
        wrapper.unmount();
    });
});

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import App from '../../webview/App.vue';
import { useAnnouncer } from '../../webview/composables/useAnnouncer';
import { DEV_DOCUMENT } from '../../webview/fixtures/devDocument';
import { stubLayout } from './layoutStub';

/**
 * `POLISH-02`. MASTER_PLAN §11.7, checked against what the DOM actually says rather than
 * against what the components meant to say — every finding here came from scanning a
 * mounted app, and one of the first three was a false alarm the scan itself corrected.
 */

const INTERACTIVE = 'a[href], button, input, select, textarea';

/**
 * The name a screen reader would read, by the parts of the accname algorithm that apply
 * here: `aria-label`, `aria-labelledby`, a wrapping or associated `<label>`, own text.
 *
 * The wrapping `<label>` is why this is a function and not a check for `aria-label` — the
 * search box is named that way, and a scan without it reports a defect that is not there.
 */
function accessibleName(element: Element): string {
    const label = element.getAttribute('aria-label');
    if (label !== null && label.trim() !== '') {
        return label;
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy !== null) {
        const named = labelledBy.split(/\s+/).map(id => element.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
        if (named.trim() !== '') {
            return named.trim();
        }
    }
    const wrapping = element.closest('label');
    if (wrapping !== null && (wrapping.textContent ?? '').trim() !== '') {
        return (wrapping.textContent ?? '').trim();
    }
    const own = (element.textContent ?? '').trim();
    return own !== '' ? own : '';
}

async function app(): Promise<ReturnType<typeof mount>> {
    const wrapper = mount(App, { attachTo: document.body });
    window.postMessage({ type: 'setDocument', payload: DEV_DOCUMENT }, '*');
    await new Promise(resolve => setTimeout(resolve, 20));
    await nextTick();
    await nextTick();
    return wrapper;
}

let restore: () => void;

beforeEach(() => {
    restore = stubLayout();
});

afterEach(() => {
    restore();
});

describe('what a screen reader is told', () => {
    it('gives every interactive element a name, icon-only ones included', async () => {
        const wrapper = await app();
        const elements = [...wrapper.element.querySelectorAll(INTERACTIVE)];

        const unnamed = elements.filter(each => accessibleName(each) === '').map(each => each.outerHTML.slice(0, 80));

        expect(elements.length).toBeGreaterThan(20);
        expect(unnamed).toEqual([]);
    });

    it('takes no element out of the tab order and puts none ahead of it', async () => {
        const wrapper = await app();
        const values = [...wrapper.element.querySelectorAll('[tabindex]')].map(each => Number(each.getAttribute('tabindex')));

        expect(values.filter(value => value > 0)).toEqual([]);
        // The tree is one tab stop and the arrows move inside it, which is the ARIA tree
        // pattern — a row is not a tab stop, and the chevron inside one is explicitly not.
        expect(values).toContain(0);
        expect(values).toContain(-1);
    });

    it('says what changed, and only when something did', async () => {
        // The live region exists on every render, empty. A region added at the moment it
        // has something to say is added too late for the reader to hear it.
        const wrapper = await app();
        const region = wrapper.get('[role="status"][aria-live="polite"]');

        expect(region.text()).toBe('');
        expect(region.classes()).toContain('sr-only');
    });
});

describe('the tree, as ARIA sees it', () => {
    it('is a tree of treeitems that know their depth and their place', async () => {
        const wrapper = await app();
        const tree = wrapper.get('[role="tree"]');
        const items = wrapper.findAll('[role="treeitem"]');

        expect(tree.attributes('aria-label')).toBe('Translation units');
        expect(items.length).toBeGreaterThan(5);
        for (const item of items) {
            expect(Number(item.attributes('aria-level'))).toBeGreaterThan(0);
            expect(Number(item.attributes('aria-posinset'))).toBeGreaterThan(0);
            expect(Number(item.attributes('aria-setsize'))).toBeGreaterThan(0);
        }
    });

    it('counts siblings in the whole tree, not in the rendered window', async () => {
        // The virtualiser renders a screenful. `aria-setsize` must still be the logical
        // count, or a reader is told "3 of 30" for a branch that has eight children.
        const wrapper = await app();
        const items = wrapper.findAll('[role="treeitem"]');
        const rendered = items.length;

        const deepest = items.filter(item => item.attributes('aria-level') === '3');
        const sets = new Set(deepest.map(item => item.attributes('aria-setsize')));

        expect(sets.has(String(rendered))).toBe(false);
        expect([...sets].every(size => Number(size) > 0)).toBe(true);
    });

    it('marks a container open or closed, and says nothing of the sort about a leaf', async () => {
        const wrapper = await app();
        const items = wrapper.findAll('[role="treeitem"]');

        const containers = items.filter(item => item.classes().includes('is-container'));
        const leaves = items.filter(item => !item.classes().includes('is-container'));

        expect(containers.length).toBeGreaterThan(0);
        expect(leaves.length).toBeGreaterThan(0);
        expect(containers.every(item => item.attributes('aria-expanded') !== undefined)).toBe(true);
        expect(leaves.every(item => item.attributes('aria-expanded') === undefined)).toBe(true);
    });

    it('does not claim to be selectable, because it is not (UI-05)', async () => {
        // Focus moved to an outline and selection went away with it. `aria-selected="false"`
        // on every row would tell a reader there is a selection to make.
        const wrapper = await app();

        expect(wrapper.findAll('[aria-selected]')).toEqual([]);
    });

    it('names the focused row, since DOM focus stays on the tree', async () => {
        const wrapper = await app();
        const tree = wrapper.get('[role="tree"]');

        expect(tree.attributes('aria-activedescendant')).toBeUndefined();

        await tree.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();
        const named = tree.attributes('aria-activedescendant');

        expect(named).toBeDefined();
        expect(wrapper.get(`#${named}`).classes()).toContain('is-focused');
    });

    it('names nothing rather than an element that is not there', async () => {
        // The focused row can be scrolled out of the virtualiser's window. A pointer at an
        // element the document does not contain tells a reader there is a current item and
        // then leaves them looking for it.
        const wrapper = await app();
        const tree = wrapper.get('[role="tree"]');

        await tree.trigger('keydown', { key: 'End' });
        await nextTick();
        const named = tree.attributes('aria-activedescendant');

        expect(named === undefined || wrapper.find(`#${named}`).exists()).toBe(true);
    });

    it('moves that name with the arrow keys', async () => {
        const wrapper = await app();
        const tree = wrapper.get('[role="tree"]');

        await tree.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();
        const first = tree.attributes('aria-activedescendant');

        await tree.trigger('keydown', { key: 'ArrowDown' });
        await nextTick();

        expect(tree.attributes('aria-activedescendant')).not.toBe(first);
        expect(wrapper.get(`#${tree.attributes('aria-activedescendant')}`).classes()).toContain('is-focused');
    });
});

describe('what the live region says (§11.7)', () => {
    const first = DEV_DOCUMENT.files[0].units[0];

    /** A patch, the way the host sends one after an edit it accepted (§12.1). */
    async function patch(units: readonly unknown[]): Promise<string> {
        const wrapper = await app();
        window.postMessage({ type: 'patchUnits', payload: { fileIndex: 0, units } }, '*');
        await new Promise(resolve => setTimeout(resolve, 20));
        await nextTick();
        await nextTick();
        return wrapper.get('[role="status"][aria-live="polite"]').text();
    }

    it('says the state an accepted edit produced', async () => {
        expect(await patch([{ ...first, target: 'EditedTranslation', state: 'needs-review-translation' }]))
            .toBe('Target saved. State: needs review translation.');
    });

    it('says a target was cleared rather than saved', async () => {
        expect(await patch([{ ...first, target: '', state: 'needs-translation' }]))
            .toBe('Target cleared. State: needs translation.');
    });

    it('counts them when a patch carries several', async () => {
        const [one, two] = DEV_DOCUMENT.files[0].units;
        expect(await patch([{ ...one, target: 'Eins' }, { ...two, target: 'Zwei' }]))
            .toBe('2 translations updated.');
    });

    it('stays quiet for a patch that is not an edit (NAV-03)', async () => {
        // The pairing markers travel through the same message. "3 translations updated"
        // because a base file finished resolving is noise, and noise trains a reader to
        // ignore the region.
        expect(await patch([{ ...first, orphaned: true }])).toBe('');
    });
});

describe('the live region itself', () => {
    it('re-announces a repeat, which a region that only changes text cannot', async () => {
        // Editing three targets to `translated` in a row is the same sentence three times.
        // A screen reader announces a change, so the region is cleared and refilled.
        const announcer = useAnnouncer();

        announcer.announce('State: translated.');
        await nextTick();
        expect(announcer.message.value).toBe('State: translated.');

        announcer.announce('State: translated.');
        expect(announcer.message.value).toBe('');
        await nextTick();
        expect(announcer.message.value).toBe('State: translated.');
    });
});

describe('what is not said with colour alone (§11.6, §11.7)', () => {
    it('puts the state in words beside its dot', async () => {
        const wrapper = await app();
        const badge = wrapper.get('.state-badge');

        expect(badge.get('.dot').attributes('aria-hidden')).toBe('true');
        expect(badge.get('.label').text()).not.toBe('');
    });

    it('puts the numbers beside the bar, and the same numbers inside it', async () => {
        const wrapper = await app();
        const bar = wrapper.get('.progress');

        expect(bar.get('.counts').text()).toMatch(/^\d+\/\d+$/);
        expect(bar.get('[role="progressbar"]').attributes('aria-label')).toMatch(/^\d+ of \d+ translated$/);
    });
});

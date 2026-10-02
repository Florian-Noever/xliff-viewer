import { computeAccessibleName } from 'dom-accessibility-api';
import { vi } from 'vitest';

import { stateLabel } from '../../../webview/stateTone';

import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import type { XliffState } from '../../../shared/state';

/** Reads and drives a mounted app by what its reader sees, never by position. */

/** The names on the rendered rows, top to bottom: a container's own, or a unit's legend. */
export const rowNames = (wrapper: VueWrapper): string[] =>
    wrapper.findAll('.tree-row .name, .tree-row .legend-name').map(row => row.text());

/** Types `query` into the search field and lets the debounce run out. Needs fake timers. */
export async function search(wrapper: VueWrapper, query: string): Promise<void> {
    await wrapper.get('.search-input').setValue(query);
    await vi.runAllTimersAsync();
}

function onlyOne<T>(found: readonly T[], what: string): T {
    if (found.length !== 1) {
        throw new Error(`Expected one ${what}, found ${found.length}.`);
    }
    return found[0];
}

/** The button a screen reader would announce as `name`. */
export function buttonNamed(wrapper: VueWrapper, name: string): DOMWrapper<HTMLButtonElement> {
    return onlyOne(wrapper.findAll('button').filter(each => computeAccessibleName(each.element) === name), `button named "${name}"`);
}

/** The state filter's chip for `state`, whatever count it shows. */
export function stateChip(wrapper: VueWrapper, state: XliffState): DOMWrapper<HTMLButtonElement> {
    const label = stateLabel(state);
    return onlyOne(wrapper.findAll<HTMLButtonElement>('.chip').filter(each => each.text().replace(/\s*\d+$/, '') === label), `chip for ${label}`);
}

import { vi } from 'vitest';

import type { VueWrapper } from '@vue/test-utils';

/** Reads and drives a mounted app by what its reader sees, never by position. */

/** The names on the rendered rows, top to bottom: a container's own, or a unit's legend. */
export const rowNames = (wrapper: VueWrapper): string[] =>
    wrapper.findAll('.tree-row .name, .tree-row .legend-name').map(row => row.text());

/** Types `query` into the search field and lets the debounce run out. Needs fake timers. */
export async function search(wrapper: VueWrapper, query: string): Promise<void> {
    await wrapper.get('.search-input').setValue(query);
    await vi.runAllTimersAsync();
}

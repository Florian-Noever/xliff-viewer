import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

import type { GlobalMountOptions } from '@vue/test-utils';

// A type rather than an interface: `mount` takes its options as an index-signature record.
type SetupOptions = {
    /** Where to mount, for a test where focus or layout has to mean something. */
    readonly attachTo?: Element;
    readonly global?: GlobalMountOptions;
};

/**
 * Runs a composable inside a throwaway component: one that holds a `watch` or registers
 * `onMounted` needs a real setup scope. `render` decides what the component shows, which
 * keeps whatever it reads live.
 */
export function withSetup<T>(composable: () => T, render: (result: T) => unknown = () => null, options: SetupOptions = {}) {
    let ran: { readonly result: T } | undefined;
    const wrapper = mount(defineComponent({
        setup() {
            const result = composable();
            ran = { result };
            return () => render(result);
        },
    }), options);
    if (ran === undefined) {
        throw new Error('The composable did not run.');
    }
    return { result: ran.result, wrapper };
}

import { nextTick, readonly, ref } from 'vue';

import type { DeepReadonly, Ref } from 'vue';

/**
 * The polite live region §11.7 asks for.
 *
 * A screen reader announces a live region when its **text changes**, so saying the same
 * thing twice says it once. Editing three targets to `translated` in a row is exactly that
 * case, so every announcement clears the region first and fills it on the next tick — the
 * one reliable way to make a repeat register as a change.
 *
 * Polite, never assertive: none of this interrupts anything worth interrupting.
 */

export interface Announcer {
    /** What the region is saying. Empty between announcements, and for one tick during one. */
    readonly message: DeepReadonly<Ref<string>>;
    announce(text: string): void;
}

export function useAnnouncer(): Announcer {
    const message = ref('');

    function announce(text: string): void {
        message.value = '';
        void nextTick(() => {
            message.value = text;
        });
    }

    return { message: readonly(message), announce };
}

import { inject, provide } from 'vue';

import type { NavigationTarget } from '@shared/messages';
import type { XliffState } from '@shared/state';
import type { InjectionKey } from 'vue';

/**
 * What a unit card can ask the host to do.
 *
 * Provided once by `App.vue` and injected where it is needed, rather than passed down
 * through `UnitTree` and `TreeRow` as a prop neither of them uses. Those two carry the
 * tree; navigation is not their business.
 */

export interface UnitActions {
    open(target: NavigationTarget, unitId: string): void;
    /** Undefined while resolution has not run; null when it ran and found nothing. */
    baseFileName(): string | null | undefined;
    /** Commits a target. Called on blur, never per keystroke. */
    updateTarget(unitId: string, value: string): void;
    updateState(unitId: string, state: XliffState): void;
}

/** Exported so a test can provide a stand-in without mounting the whole app. */
export const UNIT_ACTIONS_KEY: InjectionKey<UnitActions> = Symbol('xliff-unit-actions');

export function provideUnitActions(actions: UnitActions): void {
    provide(UNIT_ACTIONS_KEY, actions);
}

/** Falls back to doing nothing, so a card can be mounted on its own in a test. */
export function useUnitActions(): UnitActions {
    return inject(UNIT_ACTIONS_KEY, {
        open: () => { },
        baseFileName: () => undefined,
        updateTarget: () => { },
        updateState: () => { },
    });
}

import { inject, provide } from 'vue';

import type { NavigationTarget } from '@shared/messages';
import type { InjectionKey } from 'vue';

/**
 * What a unit card can ask the host to do (MASTER_PLAN §10).
 *
 * Provided once by `App.vue` and injected where it is needed, rather than passed down
 * through `UnitTree` and `TreeRow` as a prop neither of them uses. Those two carry the
 * tree; navigation is not their business.
 */

export interface UnitActions {
    open(target: NavigationTarget, unitId: string): void;
    /** Undefined while resolution has not run; null when it ran and found nothing (§9.2). */
    baseFileName(): string | null | undefined;
    /** Undefined until the host has looked; false when the workspace holds no `.al` files (§10.1). */
    alSourceAvailable(): boolean | undefined;
}

/** Exported so a test can provide a stand-in without mounting the whole app. */
export const UNIT_ACTIONS_KEY: InjectionKey<UnitActions> = Symbol('xliff-unit-actions');

export function provideUnitActions(actions: UnitActions): void {
    provide(UNIT_ACTIONS_KEY, actions);
}

/** Falls back to doing nothing, so a card can be mounted on its own in a test. */
export function useUnitActions(): UnitActions {
    return inject(UNIT_ACTIONS_KEY, { open: () => { }, baseFileName: () => undefined, alSourceAvailable: () => undefined });
}

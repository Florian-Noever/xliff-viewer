import { UNIT_ACTIONS_KEY } from '../../../webview/unitActions';

import type { UnitActions } from '../../../webview/unitActions';

/** Actions that do nothing, from a host that has answered nothing yet. */
const NO_ACTIONS: UnitActions = {
    open: () => { },
    baseFileName: () => undefined,
    alSourceAvailable: () => undefined,
    isBaseFile: () => false,
    updateTarget: () => { },
    updateState: () => { },
};

/** Mount options that hand a card `NO_ACTIONS`, with the actions a test is about in their place. */
export function provideActions(actions: Partial<UnitActions> = {}): { provide: Record<symbol, UnitActions> } {
    return { provide: { [UNIT_ACTIONS_KEY as symbol]: { ...NO_ACTIONS, ...actions } } };
}

import { isKnownState, XliffState } from '@shared/state';

/**
 * How a translation state is coloured (MASTER_PLAN §11.6).
 *
 * Four tones, not thirteen colours: a translator needs to know whether a unit is done,
 * needs work, or is missing — the exact spec state is on the badge in words. **Colour is
 * never the only signal** (§11.7); every badge that has a tone also has its name.
 *
 * The tone is a class name, and the colours behind it are theme variables in the
 * component's own stylesheet. Nothing here knows a colour.
 */

export const StateTone = {
    /** `translated`, `signed-off`, `final`. */
    done: 'done',
    /** `new` and every `needs-*`: work is expected. */
    pending: 'pending',
    /** `missing`, `empty`, and anything the spec does not define (`DEC-027`). */
    absent: 'absent',
    /** `translate="no"`: excluded from every roll-up, and shown as such (§5.3). */
    muted: 'muted',
} as const;
export type StateTone = typeof StateTone[keyof typeof StateTone];

const DONE: ReadonlySet<string> = new Set<string>([XliffState.translated, XliffState.signedOff, XliffState.final]);
const ABSENT: ReadonlySet<string> = new Set<string>([XliffState.missing, XliffState.empty, XliffState.unknown]);

export function stateTone(state: XliffState): StateTone {
    if (!isKnownState(state)) {
        // A payload carrying something outside the union is broken, not optimistic.
        return StateTone.absent;
    }
    if (DONE.has(state)) {
        return StateTone.done;
    }
    return ABSENT.has(state) ? StateTone.absent : StateTone.pending;
}

/** `needs-review-translation` → `needs review translation`: a badge is not a config key. */
export function stateLabel(state: XliffState): string {
    return state.replace(/-/g, ' ');
}

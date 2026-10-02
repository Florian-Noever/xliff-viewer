import { describe, expect, it } from 'vitest';

import { stateLabel, StateTone, stateTone } from '../../webview/stateTone';
import { SPEC_STATES, XliffState } from '../../shared/state';

describe('stateTone', () => {
    const DONE: readonly XliffState[] = [XliffState.translated, XliffState.signedOff, XliffState.final];

    it('calls the three complete states done', () => {
        for (const state of DONE) {
            expect(stateTone(state), state).toBe(StateTone.done);
        }
    });

    it('calls everything else the spec defines pending', () => {
        const pending = SPEC_STATES.filter(state => !DONE.includes(state));

        expect(pending).toHaveLength(SPEC_STATES.length - DONE.length);
        for (const state of pending) {
            expect(stateTone(state), state).toBe(StateTone.pending);
        }
    });

    it('calls the three synthetic states absent', () => {
        for (const state of [XliffState.missing, XliffState.empty, XliffState.unknown]) {
            expect(stateTone(state), state).toBe(StateTone.absent);
        }
    });

    it('treats something outside the union as absent, not as fine', () => {
        expect(stateTone('proofread' as XliffState)).toBe(StateTone.absent);
    });

    it('gives every state a tone', () => {
        for (const state of Object.values(XliffState)) {
            expect(Object.values(StateTone)).toContain(stateTone(state));
        }
    });

    it('writes a state as words, not as a config key', () => {
        expect(stateLabel(XliffState.needsReviewTranslation)).toBe('needs review translation');
    });
});

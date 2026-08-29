import { describe, expect, it } from 'vitest';

import {
    COMPLETE_STATES,
    isKnownState,
    isSpecState,
    SPEC_STATES,
    STATE_SEVERITY,
    stateRank,
    worstState,
    XliffState,
} from '../../shared/state';

describe('severity order', () => {
    it('is exactly the thirteen entries of MASTER_PLAN §5.2, in order', () => {
        // Written out literally rather than derived: this ordering drives every
        // roll-up, and a derived assertion would agree with its own mistake.
        expect([...STATE_SEVERITY]).toEqual([
            'missing',
            'empty',
            'unknown',
            'new',
            'needs-translation',
            'needs-l10n',
            'needs-adaptation',
            'needs-review-translation',
            'needs-review-l10n',
            'needs-review-adaptation',
            'translated',
            'signed-off',
            'final',
        ]);
    });

    it('has no duplicates', () => {
        expect(new Set(STATE_SEVERITY).size).toBe(STATE_SEVERITY.length);
    });

    it('covers every state in the union', () => {
        expect([...STATE_SEVERITY].sort()).toEqual(Object.values(XliffState).sort());
    });
});

describe('stateRank', () => {
    it('ranks worse states lower', () => {
        expect(stateRank(XliffState.missing)).toBeLessThan(stateRank(XliffState.translated));
        expect(stateRank(XliffState.translated)).toBeLessThan(stateRank(XliffState.final));
    });

    it('puts an unknown state below every spec state, so it cannot hide behind a green badge', () => {
        for (const state of SPEC_STATES) {
            expect(stateRank(XliffState.unknown)).toBeLessThan(stateRank(state));
        }
    });

    it('ranks missing and empty worse than anything else', () => {
        expect(stateRank(XliffState.missing)).toBe(0);
        expect(stateRank(XliffState.empty)).toBe(1);
    });
});

describe('worstState', () => {
    it('returns the worse of two states', () => {
        expect(worstState(XliffState.translated, XliffState.empty)).toBe(XliffState.empty);
        expect(worstState(XliffState.empty, XliffState.translated)).toBe(XliffState.empty);
        expect(worstState(XliffState.final, XliffState.signedOff)).toBe(XliffState.signedOff);
    });

    it('is stable when both are equal', () => {
        expect(worstState(XliffState.new, XliffState.new)).toBe(XliffState.new);
    });
});

describe('isKnownState', () => {
    it('accepts every state in the union', () => {
        for (const state of Object.values(XliffState)) {
            expect(isKnownState(state)).toBe(true);
        }
    });

    it('rejects an arbitrary string and non-strings', () => {
        expect(isKnownState('needs-coffee')).toBe(false);
        expect(isKnownState('')).toBe(false);
        expect(isKnownState('Translated')).toBe(false);
        expect(isKnownState(undefined)).toBe(false);
        expect(isKnownState(null)).toBe(false);
        expect(isKnownState(3)).toBe(false);
    });
});

describe('isSpecState', () => {
    it('accepts the ten values XLIFF 1.2 defines', () => {
        expect(SPEC_STATES).toHaveLength(10);
        for (const state of SPEC_STATES) {
            expect(isSpecState(state)).toBe(true);
        }
    });

    it('rejects the three synthetic states — they never appear as a state attribute', () => {
        expect(isSpecState(XliffState.missing)).toBe(false);
        expect(isSpecState(XliffState.empty)).toBe(false);
        expect(isSpecState(XliffState.unknown)).toBe(false);
    });

    it('accepts the three states seen in the corpus', () => {
        expect(isSpecState('translated')).toBe(true);
        expect(isSpecState('needs-translation')).toBe(true);
        expect(isSpecState('needs-adaptation')).toBe(true);
    });
});

describe('COMPLETE_STATES', () => {
    it('is translated, signed-off and final, and all rank at or above translated', () => {
        expect([...COMPLETE_STATES]).toEqual(['translated', 'signed-off', 'final']);
        for (const state of COMPLETE_STATES) {
            expect(stateRank(state)).toBeGreaterThanOrEqual(stateRank(XliffState.translated));
        }
    });
});

import { describe, expect, it } from 'vitest';

import { buildAlTree } from '../../extension/xliff/alTree';
import {
    COMPLETE_STATES,
    effectiveState,
    isCompleteState,
    isKnownState,
    isSpecState,
    SPEC_STATES,
    STATE_SEVERITY,
    stateRank,
    summariseTree,
    summariseUnits,
    worstState,
    XliffState,
} from '../../shared/state';
import { FIXTURE, fixtureUnits } from '../support/fixtures';

import type { XliffTarget, XliffTransUnit } from '../../shared/model';
import type { UnitState } from '../../shared/state';

describe('severity order', () => {
    it('is exactly the thirteen states, worst first', () => {
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

    it('accepts translated, needs-translation and needs-adaptation', () => {
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

const asUnitState = (each: XliffTransUnit): UnitState => ({ state: effectiveState(each), translate: each.translate });
const summaryOf = (name: string) => summariseUnits(fixtureUnits(name).map(asUnitState));

function unit(id: string, target?: XliffTarget, translate = true): XliffTransUnit {
    return { attributes: { id }, id, translate, source: 's', target, notes: [] };
}

const target = (value: string, state?: string): XliffTarget => ({ attributes: state === undefined ? {} : { state }, state, value });

describe('isCompleteState', () => {
    it('is true for translated, signed-off and final, out of all thirteen states', () => {
        expect(STATE_SEVERITY).toHaveLength(13);
        expect(STATE_SEVERITY.filter(state => isCompleteState(state))).toEqual([XliffState.translated, XliffState.signedOff, XliffState.final]);
    });
});

describe('effectiveState', () => {
    it('is missing when the unit has no target at all', () => {
        expect(effectiveState(unit('a'))).toBe(XliffState.missing);
    });

    it('is empty when the target has no text, whatever it declares', () => {
        expect(effectiveState(unit('a', target('', 'translated')))).toBe(XliffState.empty);
        expect(effectiveState(unit('a', target('', 'needs-translation')))).toBe(XliffState.empty);
    });

    it('treats a single space as a translation, not as empty', () => {
        // Under `xml:space="preserve"` the space is the translation; trimming would report it untranslated.
        expect(effectiveState(unit('a', target(' ', 'translated')))).toBe(XliffState.translated);
    });

    it('returns the declared state when the spec defines it', () => {
        for (const state of SPEC_STATES) {
            expect(effectiveState(unit('a', target('t', state)))).toBe(state);
        }
    });

    it('is unknown for a state the spec does not define', () => {
        expect(effectiveState(unit('a', target('t', 'proofread')))).toBe(XliffState.unknown);
    });

    it('is unknown for a target that declares no state at all', () => {
        // The `minimal.xlf` fixture is exactly this. `unknown` rather than `translated`,
        // because `unknown` cannot hide behind a green badge.
        expect(effectiveState(unit('a', target('t')))).toBe(XliffState.unknown);
        expect(effectiveState(fixtureUnits(FIXTURE.minimal)[0])).toBe(XliffState.unknown);
    });
});

describe('the corpus, summarised', () => {
    it('reports the large language file exactly', () => {
        expect(summaryOf(FIXTURE.large)).toEqual({
            total: 2500,
            translatable: 2500,
            byState: { empty: 362, translated: 2138 },
            worst: XliffState.empty,
            translatedCount: 2138,
            percent: 86,
        });
    });

    it('reports a base file as entirely missing', () => {
        const summary = summaryOf(FIXTURE.base);

        expect(summary.worst).toBe(XliffState.missing);
        expect(summary.percent).toBe(0);
        expect(summary.translatedCount).toBe(0);
        expect(summary.byState).toEqual({ missing: 500 });
    });

    it('reports the outliers in a mostly translated file', () => {
        const summary = summaryOf(FIXTURE.german);

        expect(summary.byState[XliffState.needsTranslation]).toBe(1);
        expect(summary.byState[XliffState.needsAdaptation]).toBe(1);
        // needs-translation outranks needs-adaptation as the worse of the two.
        expect(summary.worst).toBe(XliffState.needsTranslation);
    });

    it('never rounds up to 100 while a unit is outstanding', () => {
        // This fixture's ratio rounds to 100, so Math.round alone would report it complete.
        expect(summaryOf(FIXTURE.german).percent).toBe(99);
    });

    it('reports a fully translated file as 100', () => {
        expect(summaryOf(FIXTURE.english).percent).toBe(100);
    });
});

describe('summariseUnits', () => {
    it('has no state for a file with nothing in it', () => {
        expect(summariseUnits([])).toEqual({
            total: 0,
            translatable: 0,
            byState: {},
            worst: undefined,
            translatedCount: 0,
            percent: 0,
        });
    });

    it('counts signed-off and final as translated', () => {
        const summary = summariseUnits(COMPLETE_STATES.map(state => ({ state, translate: true })));

        expect(summary.translatedCount).toBe(3);
        expect(summary.percent).toBe(100);
    });

    it('excludes an untranslatable unit from translatable, worst and percent', () => {
        const summary = summariseUnits([
            { state: XliffState.translated, translate: true },
            { state: XliffState.missing, translate: false },
        ]);

        expect(summary.total).toBe(2);
        expect(summary.translatable).toBe(1);
        expect(summary.worst).toBe(XliffState.translated);
        expect(summary.percent).toBe(100);
    });

    it('still counts an untranslatable unit in total and byState', () => {
        // It is displayed, muted, so it has to stay countable.
        const summary = summariseUnits([{ state: XliffState.missing, translate: false }]);

        expect(summary.total).toBe(1);
        expect(summary.byState).toEqual({ missing: 1 });
        expect(summary.worst).toBeUndefined();
        expect(summary.percent).toBe(0);
    });

    it('leaves worst undefined rather than green when nothing is translatable', () => {
        const summary = summariseUnits([{ state: XliffState.translated, translate: false }]);

        expect(summary.worst).toBeUndefined();
        expect(summary.translatable).toBe(0);
        expect(summary.percent).toBe(0);
    });
});

describe('summariseTree', () => {
    const states = new Map<string, UnitState>([
        ['Table 1 - Property 1', { state: XliffState.translated, translate: true }],
        ['Table 1 - Property 2', { state: XliffState.empty, translate: true }],
        ['Table 2 - Property 3', { state: XliffState.translated, translate: true }],
    ]);
    const nodes = buildAlTree([...states.keys()].map(id => unit(id)));
    const summaries = summariseTree(nodes, states);

    it('summarises every node, keyed by node key', () => {
        expect([...summaries.keys()].sort()).toEqual([
            'Table 1',
            'Table 1 - Property 1',
            'Table 1 - Property 2',
            'Table 2',
            'Table 2 - Property 3',
        ]);
    });

    it('rolls the worst descendant up to the container', () => {
        expect(summaries.get('Table 1')?.worst).toBe(XliffState.empty);
        expect(summaries.get('Table 1')?.total).toBe(2);
        expect(summaries.get('Table 1')?.percent).toBe(50);
    });

    it('leaves a sibling container unaffected', () => {
        expect(summaries.get('Table 2')?.worst).toBe(XliffState.translated);
        expect(summaries.get('Table 2')?.percent).toBe(100);
    });

    it('summarises a leaf as the one unit it carries', () => {
        expect(summaries.get('Table 1 - Property 2')).toEqual({
            total: 1,
            translatable: 1,
            byState: { empty: 1 },
            worst: XliffState.empty,
            translatedCount: 0,
            percent: 0,
        });
    });

    it('does not let an untranslatable unit move its parent percent', () => {
        const withNo = new Map(states);
        withNo.set('Table 1 - Property 4', { state: XliffState.missing, translate: false });
        const rolled = summariseTree(buildAlTree([...withNo.keys()].map(id => unit(id))), withNo);

        expect(rolled.get('Table 1')?.percent).toBe(summaries.get('Table 1')?.percent);
        expect(rolled.get('Table 1')?.worst).toBe(XliffState.empty);
        expect(rolled.get('Table 1')?.total).toBe(3);
        expect(rolled.get('Table 1')?.translatable).toBe(2);
    });

    it('counts a unit sitting on a container, not only on leaves', () => {
        const carrying = new Map<string, UnitState>([
            ['Table 1', { state: XliffState.empty, translate: true }],
            ['Table 1 - Property 1', { state: XliffState.translated, translate: true }],
        ]);
        const rolled = summariseTree(buildAlTree([...carrying.keys()].map(id => unit(id))), carrying);

        expect(rolled.get('Table 1')?.total).toBe(2);
        expect(rolled.get('Table 1')?.worst).toBe(XliffState.empty);
    });

    it('ignores a unit id that is not in the map, so a filtered view summarises itself', () => {
        const only = new Map<string, UnitState>([['Table 1 - Property 1', { state: XliffState.translated, translate: true }]]);
        const rolled = summariseTree(nodes, only);

        expect(rolled.get('Table 1')?.total).toBe(1);
        expect(rolled.get('Table 1 - Property 2')?.total).toBe(0);
        expect(rolled.get('Table 1 - Property 2')?.worst).toBeUndefined();
    });

    it('accounts for every unit of the large file exactly once', () => {
        const units = fixtureUnits(FIXTURE.large);
        const map = new Map(units.map(each => [each.id, asUnitState(each)]));
        const roots = buildAlTree(units);
        const rolled = summariseTree(roots, map);

        const rootTotals = roots.reduce((sum, node) => sum + (rolled.get(node.key)?.total ?? 0), 0);
        const rootTranslated = roots.reduce((sum, node) => sum + (rolled.get(node.key)?.translatedCount ?? 0), 0);

        expect(rootTotals).toBe(units.length);
        expect(rootTranslated).toBe(2138);
    });

});

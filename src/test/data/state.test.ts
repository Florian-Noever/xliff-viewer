import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildAlTree } from '../../extension/xliff/alTree';
import { parseXliff } from '../../extension/xliff/parser';
import { iterateUnits } from '../../shared/model';
import {
    COMPLETE_STATES,
    effectiveState,
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

import type { XliffTarget, XliffTransUnit } from '../../shared/model';
import type { UnitState } from '../../shared/state';

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

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));

function unitsOf(name: string): XliffTransUnit[] {
    return [...iterateUnits(parseXliff(readFileSync(`${EXAMPLES}/${name}`, 'utf8')))];
}

const asUnitState = (each: XliffTransUnit): UnitState => ({ state: effectiveState(each), translate: each.translate });
const summaryOf = (name: string) => summariseUnits(unitsOf(name).map(asUnitState));

function unit(id: string, target?: XliffTarget, translate = true): XliffTransUnit {
    return { attributes: { id }, id, translate, source: 's', target, notes: [] };
}

const target = (value: string, state?: string): XliffTarget => ({ attributes: state === undefined ? {} : { state }, state, value });

describe('effectiveState', () => {
    it('is missing when the unit has no target at all', () => {
        expect(effectiveState(unit('a'))).toBe(XliffState.missing);
    });

    it('is empty when the target has no text, whatever it declares', () => {
        expect(effectiveState(unit('a', target('', 'translated')))).toBe(XliffState.empty);
        expect(effectiveState(unit('a', target('', 'needs-translation')))).toBe(XliffState.empty);
    });

    it('treats a single space as a translation, not as empty', () => {
        // Ten corpus units are exactly this; trimming would report them untranslated (MASTER_PLAN 3.6).
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
        // `test.xlf` is exactly this. `unknown` is the one that cannot hide behind a
        // green badge, which is why DEC-027 chose it over `translated`.
        expect(effectiveState(unit('a', target('t')))).toBe(XliffState.unknown);
        expect(effectiveState(unitsOf('test.xlf')[0])).toBe(XliffState.unknown);
    });
});

describe('the corpus, summarised', () => {
    it('reports Fabrikam Base.de-DE.xlf exactly', () => {
        expect(summaryOf('Fabrikam Base.de-DE.xlf')).toEqual({
            total: 2511,
            translatable: 2511,
            byState: { empty: 360, translated: 2151 },
            worst: XliffState.empty,
            translatedCount: 2151,
            percent: 86,
        });
    });

    it('reports a base file as entirely missing', () => {
        const summary = summaryOf('Contoso App.g.xlf');

        expect(summary.worst).toBe(XliffState.missing);
        expect(summary.percent).toBe(0);
        expect(summary.translatedCount).toBe(0);
        expect(summary.byState).toEqual({ missing: 1098 });
    });

    it('reports the two outliers in Contoso App.de-DE.xlf', () => {
        const summary = summaryOf('Contoso App.de-DE.xlf');

        expect(summary.byState[XliffState.needsTranslation]).toBe(1);
        expect(summary.byState[XliffState.needsAdaptation]).toBe(1);
        // needs-translation outranks needs-adaptation as the worse of the two.
        expect(summary.worst).toBe(XliffState.needsTranslation);
    });

    it('never rounds up to 100 while a unit is outstanding', () => {
        // 1096 of 1098 is 99.8 %, which Math.round alone would report as complete.
        expect(summaryOf('Contoso App.de-DE.xlf').percent).toBe(99);
    });

    it('reports a fully translated file as 100', () => {
        expect(summaryOf('Contoso App.en-US.xlf').percent).toBe(100);
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
        // It is displayed, muted, so it has to stay countable (MASTER_PLAN 5.3, rule 3).
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
        const units = unitsOf('Fabrikam Base.de-DE.xlf');
        const map = new Map(units.map(each => [each.id, asUnitState(each)]));
        const roots = buildAlTree(units);
        const rolled = summariseTree(roots, map);

        const rootTotals = roots.reduce((sum, node) => sum + (rolled.get(node.key)?.total ?? 0), 0);
        const rootTranslated = roots.reduce((sum, node) => sum + (rolled.get(node.key)?.translatedCount ?? 0), 0);

        expect(rootTotals).toBe(units.length);
        expect(rootTranslated).toBe(2151);
    });

    it('rolls the large file up within the MASTER_PLAN 16 budget', () => {
        const units = unitsOf('Fabrikam Base.de-DE.xlf');
        const map = new Map(units.map(each => [each.id, asUnitState(each)]));
        const roots = buildAlTree(units);
        summariseTree(roots, map);

        let best = Number.POSITIVE_INFINITY;
        for (let attempt = 0; attempt < 3; attempt++) {
            const started = performance.now();
            summariseTree(roots, map);
            best = Math.min(best, performance.now() - started);
        }
        expect(best).toBeLessThan(40);
    });
});

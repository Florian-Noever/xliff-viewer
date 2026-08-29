/**
 * The translation-state domain and its roll-up (MASTER_PLAN §5.1 … §5.4, `DEC-005`).
 *
 * The roll-up lives here, in `src/shared/`, because the **webview** computes it
 * (`DEC-016`): shipping a summary per node made the DTO larger than the source file.
 *
 * An `as const` object rather than a TypeScript `enum` (§14.5): this crosses the
 * `postMessage` boundary and is serialised to JSON.
 */

import type { XliffTransUnit } from './model';

export const XliffState = {
    /** Synthetic: the unit has no `<target>` element at all. Every unit of a `.g.xlf`. */
    missing: 'missing',
    /** Synthetic: a `<target>` exists but its text is empty. */
    empty: 'empty',
    /** Synthetic: the file declared a `state` value the spec does not define. */
    unknown: 'unknown',

    new: 'new',
    needsTranslation: 'needs-translation',
    needsL10n: 'needs-l10n',
    needsAdaptation: 'needs-adaptation',
    needsReviewTranslation: 'needs-review-translation',
    needsReviewL10n: 'needs-review-l10n',
    needsReviewAdaptation: 'needs-review-adaptation',
    translated: 'translated',
    signedOff: 'signed-off',
    final: 'final',
} as const;

export type XliffState = typeof XliffState[keyof typeof XliffState];

/**
 * Worst first. **The single source of truth for roll-up, sorting and colour** (§5.2) —
 * getting this order wrong silently corrupts every roll-up, so it is copied literally
 * from the plan and asserted entry-by-entry in the tests.
 */
export const STATE_SEVERITY = [
    XliffState.missing,
    XliffState.empty,
    XliffState.unknown,
    XliffState.new,
    XliffState.needsTranslation,
    XliffState.needsL10n,
    XliffState.needsAdaptation,
    XliffState.needsReviewTranslation,
    XliffState.needsReviewL10n,
    XliffState.needsReviewAdaptation,
    XliffState.translated,
    XliffState.signedOff,
    XliffState.final,
] as const satisfies readonly XliffState[];

/**
 * The ten values XLIFF 1.2 defines, in spec order. These are the only ones that may be
 * written into a file; `missing`, `empty` and `unknown` describe a unit, they never
 * appear as a `state` attribute.
 */
export const SPEC_STATES = [
    XliffState.new,
    XliffState.needsTranslation,
    XliffState.needsL10n,
    XliffState.needsAdaptation,
    XliffState.needsReviewTranslation,
    XliffState.needsReviewL10n,
    XliffState.needsReviewAdaptation,
    XliffState.translated,
    XliffState.signedOff,
    XliffState.final,
] as const satisfies readonly XliffState[];

/** States that count as "done" for progress reporting. */
export const COMPLETE_STATES = [
    XliffState.translated,
    XliffState.signedOff,
    XliffState.final,
] as const satisfies readonly XliffState[];

const RANK: ReadonlyMap<string, number> = new Map(STATE_SEVERITY.map((state, index) => [state, index]));

/** Position in the severity order — lower is worse. */
export function stateRank(state: XliffState): number {
    return RANK.get(state) ?? 0;
}

/** True for any of the thirteen states this project recognises. */
export function isKnownState(value: unknown): value is XliffState {
    return typeof value === 'string' && RANK.has(value);
}

/** True only for the ten values that may legally appear as a `state` attribute. */
export function isSpecState(value: unknown): value is XliffState {
    return typeof value === 'string' && (SPEC_STATES as readonly string[]).includes(value);
}

/** The worse of two states, by §5.2. */
export function worstState(a: XliffState, b: XliffState): XliffState {
    return stateRank(a) <= stateRank(b) ? a : b;
}

// ── Roll-up (§5.3, §5.4) ─────────────────────────────────────────────────────

/**
 * The effective state of one unit (§5.3, rule 2).
 *
 * The declared `state` is the least of the three signals. A unit with no `<target>` is
 * `missing` whatever it declares, and an **empty target is `empty` even when it declares
 * `translated`** — 362 corpus units declare `needs-translation` and are empty, and it is
 * the emptiness a translator needs to see.
 *
 * Empty means exactly `''`. A target holding a single space is a translation, not an
 * empty one (§3.6) — the corpus has ten.
 *
 * A target that holds text but declares **no** state is `unknown`, not `translated`
 * (`DEC-027`): the file never claimed the unit was done, so it must not look done.
 */
export function effectiveState(unit: XliffTransUnit): XliffState {
    if (unit.target === undefined) {
        return XliffState.missing;
    }
    if (unit.target.value === '') {
        return XliffState.empty;
    }
    return isSpecState(unit.target.state) ? unit.target.state : XliffState.unknown;
}

/** What a roll-up needs to know about a unit. `TransUnitDto` will satisfy it structurally. */
export interface UnitState {
    readonly state: XliffState;
    /** `translate="no"` → false. Excluded from `translatable`, `worst` and `percent`. */
    readonly translate: boolean;
}

/**
 * The structure a roll-up walks. Both `AlNode` and `AlNodeDto` satisfy it.
 *
 * A node carries a unit exactly when its `key` is that unit's id — the tree is built from
 * the ids, so the node a unit lands on has the whole id as its key. That is why the lookup
 * below needs no separate `unitId` field, and why the DTO does not ship one.
 */
export interface SummaryNode {
    readonly key: string;
    readonly children: readonly SummaryNode[];
}

/** §5.4. Every node carries one, including the file root. */
export interface StateSummary {
    /** Every descendant unit, translatable or not. */
    readonly total: number;
    /** Descendants excluding `translate="no"`. */
    readonly translatable: number;
    /** Counts every descendant, so it sums to `total` — untranslatable units are shown, so they are counted. */
    readonly byState: Readonly<Partial<Record<XliffState, number>>>;
    /** The worst translatable descendant. **Undefined, never a green state, when there are none** (§5.3, rule 4). */
    readonly worst: XliffState | undefined;
    /** `translated`, `signed-off` or `final`, among translatable descendants. */
    readonly translatedCount: number;
    /** Rounded, and clamped off 0 and 100 so a single outstanding unit cannot read as complete. */
    readonly percent: number;
}

const COMPLETE: ReadonlySet<string> = new Set<string>(COMPLETE_STATES);

interface SummaryAccumulator {
    total: number;
    translatable: number;
    translatedCount: number;
    worst: XliffState | undefined;
    readonly byState: Partial<Record<XliffState, number>>;
}

function emptyAccumulator(): SummaryAccumulator {
    return { total: 0, translatable: 0, translatedCount: 0, worst: undefined, byState: {} };
}

function addUnit(accumulator: SummaryAccumulator, unit: UnitState): void {
    accumulator.total++;
    accumulator.byState[unit.state] = (accumulator.byState[unit.state] ?? 0) + 1;

    if (!unit.translate) {
        return;
    }

    accumulator.translatable++;
    if (COMPLETE.has(unit.state)) {
        accumulator.translatedCount++;
    }
    accumulator.worst = accumulator.worst === undefined ? unit.state : worstState(accumulator.worst, unit.state);
}

function addSummary(accumulator: SummaryAccumulator, summary: StateSummary): void {
    accumulator.total += summary.total;
    accumulator.translatable += summary.translatable;
    accumulator.translatedCount += summary.translatedCount;

    for (const state of STATE_SEVERITY) {
        const count = summary.byState[state];
        if (count !== undefined) {
            accumulator.byState[state] = (accumulator.byState[state] ?? 0) + count;
        }
    }

    if (summary.worst !== undefined) {
        accumulator.worst = accumulator.worst === undefined ? summary.worst : worstState(accumulator.worst, summary.worst);
    }
}

function toPercent(translatedCount: number, translatable: number): number {
    if (translatable === 0 || translatedCount === 0) {
        return 0;
    }
    if (translatedCount === translatable) {
        return 100;
    }
    return Math.min(99, Math.max(1, Math.round((translatedCount / translatable) * 100)));
}

function sealAccumulator(accumulator: SummaryAccumulator): StateSummary {
    return {
        total: accumulator.total,
        translatable: accumulator.translatable,
        byState: accumulator.byState,
        worst: accumulator.worst,
        translatedCount: accumulator.translatedCount,
        percent: toPercent(accumulator.translatedCount, accumulator.translatable),
    };
}

/** Summarises a flat set of units — what the file header shows. */
export function summariseUnits(units: Iterable<UnitState>): StateSummary {
    const accumulator = emptyAccumulator();
    for (const unit of units) {
        addUnit(accumulator, unit);
    }
    return sealAccumulator(accumulator);
}

/**
 * Summarises every node of a tree, bottom-up, in one pass.
 *
 * `states` is keyed by trans-unit id, which is also the key of the node that carries it.
 * A node whose key is not in `states` contributes nothing of its own, which is what makes
 * the same function usable over a filtered view.
 *
 * Returns a `key → summary` map rather than writing onto the nodes: `AlNode` is readonly,
 * and a map is what "computed once per load and cached" (§5.3, rule 5) means for an
 * immutable tree. Keys are stable, so the map survives re-renders.
 */
export function summariseTree(nodes: readonly SummaryNode[], states: ReadonlyMap<string, UnitState>): ReadonlyMap<string, StateSummary> {
    const summaries = new Map<string, StateSummary>();
    for (const node of nodes) {
        summariseNode(node, states, summaries);
    }
    return summaries;
}

function summariseNode(node: SummaryNode, states: ReadonlyMap<string, UnitState>, summaries: Map<string, StateSummary>): StateSummary {
    const accumulator = emptyAccumulator();

    for (const child of node.children) {
        addSummary(accumulator, summariseNode(child, states, summaries));
    }

    const own = states.get(node.key);
    if (own !== undefined) {
        addUnit(accumulator, own);
    }

    const summary = sealAccumulator(accumulator);
    summaries.set(node.key, summary);
    return summary;
}

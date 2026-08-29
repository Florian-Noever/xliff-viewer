/**
 * The translation-state domain (MASTER_PLAN §5.1, §5.2, `DEC-005`).
 *
 * An `as const` object rather than a TypeScript `enum` (§14.5): this crosses the
 * `postMessage` boundary and is serialised to JSON.
 */

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

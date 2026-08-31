import { XliffState } from '@shared/state';

import type { TransUnitDto } from '@shared/dto';

/**
 * The §12.4 checks: what a translation is probably getting wrong.
 *
 * **Every one of these is advisory.** None blocks an edit, none changes a value, and none
 * is an error — a translator who meant it is right and the hint is wrong. That is why they
 * are computed here rather than in the host: nothing downstream of them may act on them.
 *
 * Two exclusions, both to keep the hints worth reading:
 *
 * - a unit with **no `<target>`** is not checked. It has nothing to be wrong about, and a
 *   base file is nothing but such units;
 * - a `translate="no"` unit is not checked, for the same reason the roll-up excludes it
 *   (§5.4): the file has said this one is not a translation.
 *
 * §12.4's fifth line — leading and trailing whitespace differing from the source — is not
 * here. `DEC-021` already marks that case in the target itself and explains why, and it does
 * so **unconditionally**: the marks are not a hint, and leaving them behind when
 * `validation.enabled` is off would leave glyphs on screen with nothing to explain them.
 */

export const HintKind = {
    /** The target is longer than the file says it may be. */
    maxwidth: 'maxwidth',
    /** A `%1`-style placeholder is in one of source and target and not the other. */
    placeholders: 'placeholders',
    /** The target is empty and the file calls it finished. */
    statedButEmpty: 'statedButEmpty',
    /** The target repeats the source verbatim. Off by default — see `DEC-037`. */
    sameAsSource: 'sameAsSource',
} as const;
export type HintKind = typeof HintKind[keyof typeof HintKind];

export interface Hint {
    readonly kind: HintKind;
    readonly message: string;
}

export interface HintOptions {
    /** The `<file>`'s own languages. Equal ones make the same-as-source hint meaningless. */
    readonly sourceLanguage?: string;
    readonly targetLanguage?: string;
    /** `xliffViewer.validation.sameAsSource` (`DEC-037`). */
    readonly sameAsSource: boolean;
}

/**
 * What `maxwidth` has to be counting for a character count to mean anything.
 *
 * XLIFF 1.2 defaults `size-unit` to `pixel`, which we cannot measure and must not guess at.
 * AL writes `char` on every unit, so the check runs where it is meaningful and stays quiet
 * on a hand-written file that meant pixels.
 */
const CHARACTERS = 'char';

/** `%1` is AL's; `#1` is in §12.4's list because other XLIFF producers use it. */
const PLACEHOLDER = /%\d+|#\d+/g;

/** The states that claim the work is done, and which an empty target therefore contradicts. */
const FINISHED: readonly XliffState[] = [XliffState.translated, XliffState.signedOff, XliffState.final];

export function hintsFor(unit: TransUnitDto, options: HintOptions): readonly Hint[] {
    const target = unit.target;
    if (target === undefined || !unit.translate) {
        return [];
    }

    if (target === '') {
        // The only thing worth saying about an empty target is that the file calls it done.
        // Everything else — no placeholders, no overrun — is a restatement of "untranslated",
        // which the state already says. Measured: without this, three of the corpus's four
        // placeholder findings are untranslated units.
        return unit.declaredState !== undefined && FINISHED.includes(unit.declaredState)
            ? [{ kind: HintKind.statedButEmpty, message: `This target is empty, but the file declares it ${unit.declaredState}.` }]
            : [];
    }

    const hints: Hint[] = [];
    const placeholders = comparePlaceholders(unit.source, target);
    if (placeholders !== undefined) {
        hints.push({ kind: HintKind.placeholders, message: placeholders });
    }

    if (unit.maxwidth !== undefined && unit.sizeUnit === CHARACTERS && target.length > unit.maxwidth) {
        hints.push({
            kind: HintKind.maxwidth,
            message: `This target is ${target.length} characters; the file allows ${unit.maxwidth}.`,
        });
    }

    if (options.sameAsSource && target === unit.source && translatesBetweenLanguages(options)) {
        hints.push({ kind: HintKind.sameAsSource, message: 'This target repeats the source word for word.' });
    }

    return hints;
}

/**
 * Compared as **sets**, which is what §12.4 asks for — "present in source but missing from
 * target, or vice versa". Counting them instead would flag the corpus unit whose target
 * deliberately uses each of `%1`…`%4` twice, which is not a mistake.
 */
function comparePlaceholders(source: string, target: string): string | undefined {
    const inSource = new Set(source.match(PLACEHOLDER) ?? []);
    const inTarget = new Set(target.match(PLACEHOLDER) ?? []);
    const missing = [...inSource].filter(each => !inTarget.has(each));
    const added = [...inTarget].filter(each => !inSource.has(each));

    if (missing.length === 0 && added.length === 0) {
        return undefined;
    }
    if (added.length === 0) {
        return `The source uses ${list(missing)}; the target does not.`;
    }
    if (missing.length === 0) {
        return `The target uses ${list(added)}; the source does not.`;
    }
    return `The source uses ${list(missing)} and the target uses ${list(added)} instead.`;
}

/**
 * A file whose two languages are the same is not a translation of anything — every unit in
 * `Contoso App.en-US.xlf` repeats its source, and saying so 1098 times helps nobody.
 */
function translatesBetweenLanguages(options: HintOptions): boolean {
    return options.targetLanguage !== undefined && options.targetLanguage !== options.sourceLanguage;
}

function list(values: readonly string[]): string {
    if (values.length === 1) {
        return values[0];
    }
    return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

import type { TransUnitDto } from '@shared/dto';
import type { XliffState } from '@shared/state';

/**
 * The translations a unit carries, as a list.
 *
 * **There is exactly one, and that is the format's doing, not an oversight.** XLIFF 1.2
 * allows a single `<target>` per `<trans-unit>`; its construct for alternatives,
 * `<alt-trans>`, is not modelled. Several languages means several *files*.
 *
 * So this returns a one-element list on purpose: it is the seam for showing several
 * languages side by side, and it costs one array — the payload is untouched,
 * `TransUnitDto.target` stays singular, and nothing crosses the wire that XLIFF cannot
 * express.
 */
export interface Translation {
    /** The `<file>`'s target language, or undefined when it declares none. */
    readonly language?: string;
    /** Undefined when the unit has no `<target>` at all; an empty string is an empty target. */
    readonly value?: string;
    readonly state: XliffState;
}

export function translations(unit: TransUnitDto, targetLanguage?: string): readonly Translation[] {
    return [{ language: targetLanguage, value: unit.target, state: unit.state }];
}

/** What labels the row: the language in brackets, or the plain word when there is none. */
export function translationLabel(translation: Translation): string {
    return translation.language === undefined ? 'target' : `[ ${translation.language} ]`;
}

import type { TransUnitDto } from '@shared/dto';
import type { XliffState } from '@shared/state';

/** One translation of a unit, as a card's row shows it. */
export interface Translation {
    /** The `<file>`'s target language, or undefined when it declares none. */
    readonly language?: string;
    /** Undefined when the unit has no `<target>` at all; an empty string is an empty target. */
    readonly value?: string;
    readonly state: XliffState;
}

/**
 * The translations a unit carries, one entry each. In XLIFF 1.2 a `<trans-unit>` has at most
 * one `<target>`, so there is one entry.
 */
export function translations(unit: TransUnitDto, targetLanguage?: string): readonly Translation[] {
    return [{ language: targetLanguage, value: unit.target, state: unit.state }];
}

/** What labels the row: the language in brackets, or the plain word when there is none. */
export function translationLabel(translation: Translation): string {
    return translation.language === undefined ? 'target' : `[ ${translation.language} ]`;
}

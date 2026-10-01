/**
 * Which whitespace in a target is worth showing.
 *
 * `xml:space="preserve"` is on every AL unit, so a leading space is data. But marking
 * every target with edge whitespace would train the reader to ignore the marker, so only
 * the load-bearing cases are marked:
 *
 * - a target that is **nothing but** whitespace, such as a deliberate "this caption
 *   renders blank" translation, which would otherwise look empty;
 * - edge whitespace that **differs from the source's**, which is where a translation
 *   silently gains or loses a space.
 */

export const WhitespaceReason = {
    /** The whole target is whitespace. Without a marker it reads as empty. */
    only: 'only',
    /** Its leading or trailing whitespace is not the source's. */
    edges: 'edges',
} as const;
export type WhitespaceReason = typeof WhitespaceReason[keyof typeof WhitespaceReason];

export interface WhitespaceParts {
    readonly lead: string;
    readonly core: string;
    readonly trail: string;
}

/**
 * Splits a string into its leading whitespace, its middle, and its trailing whitespace. A
 * string of nothing but whitespace is all lead.
 */
export function whitespaceParts(value: string): WhitespaceParts {
    const core = value.trim();
    if (core === '') {
        return { lead: value, core: '', trail: '' };
    }
    const lead = value.slice(0, value.length - value.trimStart().length);
    return { lead, core, trail: value.slice(lead.length + core.length) };
}

/** Undefined when the whitespace carries nothing the reader needs to know about. */
export function loadBearingWhitespace(source: string, target: string | undefined): WhitespaceReason | undefined {
    if (target === undefined || target === '') {
        return undefined;
    }
    if (target.trim() === '') {
        return WhitespaceReason.only;
    }

    const inTarget = whitespaceParts(target);
    const inSource = whitespaceParts(source);
    return inTarget.lead === inSource.lead && inTarget.trail === inSource.trail
        ? undefined
        : WhitespaceReason.edges;
}

/** Why this target is marked when others are not, so the marker explains itself. */
export function whitespaceExplanation(reason: WhitespaceReason): string {
    return reason === WhitespaceReason.only
        ? 'This target is only whitespace. Spaces are shown where they change the meaning.'
        : 'The spaces at the edges differ from the source. Spaces are shown where they change the meaning.';
}

/** What joins the segments of a trans-unit id: `Table 1 - Field 2 - Property 3`. */
export const SEGMENT_SEPARATOR = ' - ';

/** The segment type AL puts in front of an object's path, in a namespaced app, to name its namespace. */
export const NAMESPACE_TYPE = 'Namespace';

/**
 * Splits a trans-unit id into the text of its segments.
 *
 * Ids can carry readable names, and a name that contains the separator always contains
 * whitespace, which AL answers by quoting it: `Report "Sales - Quote" - Property Caption`.
 * Splitting only outside double quotes is therefore exact. Inside a quoted name `""` is an
 * escaped quote, which toggles out of the quote and straight back in.
 */
export function splitUnitId(id: string): string[] {
    if (!id.includes('"')) {
        return id.split(SEGMENT_SEPARATOR);
    }

    const segments: string[] = [];
    let start = 0;
    let quoted = false;
    for (let index = 0; index < id.length; index++) {
        if (id[index] === '"') {
            quoted = !quoted;
        } else if (!quoted && id.startsWith(SEGMENT_SEPARATOR, index)) {
            segments.push(id.slice(start, index));
            index += SEGMENT_SEPARATOR.length - 1;
            start = index + 1;
        }
    }
    segments.push(id.slice(start));
    return segments;
}

/** The last segment of an id as written — a label of last resort for a node without a name. */
export function lastSegmentLabel(id: string): string {
    return splitUnitId(id).at(-1) ?? id;
}

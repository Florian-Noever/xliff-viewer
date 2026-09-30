import { alNameHash } from './alNameHash';
import { SEGMENT_SEPARATOR, splitUnitId } from '../../shared/unitPath';

/**
 * One segment of a trans-unit id.
 *
 * AL writes a segment's value as the hash of a name (`Field 4264183382`) or — with the
 * compiler's namespace feature — as the name itself, quoted when it contains whitespace or
 * is all digits (`Field "No."`, `Method "12345"`).
 */
export interface UnitIdSegment {
    /** An open string — never an enum of allowed AL kinds. */
    readonly type: string;
    /** Everything after the type and its space, exactly as written; empty when there is none. */
    readonly value: string;
    /** Set when the value is a hash. */
    readonly hash?: string;
    /** Set when the value is a readable name: unquoted, with `""` read as `"`. */
    readonly name?: string;
}

const HASH = /^-?\d+$/;

/** Reads a trans-unit id into its segments. */
export function parseUnitId(id: string): UnitIdSegment[] {
    return splitUnitId(id).map(parseSegment);
}

function parseSegment(text: string): UnitIdSegment {
    const space = text.indexOf(' ');
    if (space < 0) {
        return { type: text, value: '' };
    }

    const type = text.slice(0, space);
    const value = text.slice(space + 1);
    return HASH.test(value) ? { type, value, hash: value } : { type, value, name: unquote(value) };
}

function unquote(value: string): string {
    return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1).replace(/""/g, '"')
        : value;
}

/** The hash as written, or the one AL writes for the readable name; empty when there is no value. */
export function canonicalHash(segment: UnitIdSegment): string {
    if (segment.hash !== undefined) {
        return segment.hash;
    }
    return segment.name === undefined ? '' : alNameHash(segment.name);
}

/**
 * The segment as `<Type> <hash>`: the hash as written, or the one AL writes for its readable
 * name. A segment with no value stays as written.
 */
export function canonicalSegment(segment: UnitIdSegment): string {
    const hash = canonicalHash(segment);
    return hash === '' ? segment.type : `${segment.type} ${hash}`;
}

/**
 * The id every segment of which is `<Type> <hash>` — equal for the readable and the hashed
 * form of the same symbol path.
 */
export function canonicalPath(segments: readonly UnitIdSegment[]): string {
    return segments.map(canonicalSegment).join(SEGMENT_SEPARATOR);
}

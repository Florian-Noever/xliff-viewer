import { parseUnitId } from './unitId';
import { SEGMENT_SEPARATOR } from '../../shared/unitPath';

import type { XliffNote, XliffTransUnit } from '../../shared/model';

/**
 * Display names for the AL hierarchy.
 *
 * The tree itself is built from the id and its hashes; everything here is label text
 * only, so a failure degrades the display and never the structure.
 */

export const GENERATOR_NOTE_FROM = 'Xliff Generator';
const DEVELOPER_NOTE_FROM = 'Developer';

/** `de-DE=…`, `en-US=…`. Deliberately anchored: `%1 = Document No.` must not match. */
const LANGUAGE_PREFIX = /^([a-z]{2}(?:-[A-Za-z0-9]{2,8})?)=([\s\S]*)$/;

/**
 * True when every segment is `<Type> <value>` — i.e. the id is AL-shaped.
 *
 * `id="1"` is a legal XLIFF id that carries no AL structure at all.
 */
export function hasAlStructure(id: string): boolean {
    return parseUnitId(id).every(segment => segment.type !== '' && segment.value !== '');
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts one name per id segment from the `Xliff Generator` note.
 *
 * Splitting the note on ` - ` is the obvious approach and is **wrong**: AL object names
 * can contain that separator (`Report Sales - Quote`). Instead the segment **types**
 * come from the id and are used as anchors, with lazy quantifiers so a name can absorb
 * any ` - ` not followed by the next expected type:
 *
 * ```text
 * id    Table 2023264910 - Field 1165218225 - Property 2879900210
 * types [Table, Field, Property]
 * regex /^Table (.+?) - Field (.+?) - Property (.+)$/
 * ```
 *
 * Returns `null` rather than guessing when the note does not match — the caller then
 * shows the raw note and leaves ancestors unnamed.
 */
export function namesFromNote(id: string, note: string | undefined): string[] | null {
    if (note === undefined || note === '') {
        return null;
    }

    const segments = parseUnitId(id);

    // Every segment but the last is lazy, so it yields at the first following anchor;
    // the last is greedy and takes the remainder.
    const pattern = segments
        .map((segment, index) => `${escapeRegex(segment.type)} ${index === segments.length - 1 ? '(.+)' : '(.+?)'}`)
        .join(SEGMENT_SEPARATOR);

    const match = new RegExp(`^${pattern}$`).exec(note);
    return match === null ? null : match.slice(1);
}

/** The `Xliff Generator` note's text, or undefined when the unit has none. */
export function generatorNote(unit: XliffTransUnit): string | undefined {
    return findNote(unit.notes, GENERATOR_NOTE_FROM);
}

/** The `Developer` note's text, or undefined when the unit has none. */
export function developerNote(unit: XliffTransUnit): string | undefined {
    return findNote(unit.notes, DEVELOPER_NOTE_FROM);
}

function findNote(notes: readonly XliffNote[], from: string): string | undefined {
    return notes.find(note => note.from === from)?.value;
}

export interface DeveloperHint {
    /** Present only when the note actually began `xx-XX=`. */
    readonly language?: string;
    /** The suggestion, or the whole note when there was no language prefix. */
    readonly text: string;
}

/**
 * Reads a `Developer` note as a translator hint.
 *
 * AL developers usually write `de-DE=<suggestion>`, but the note is free text such as
 * `%1 = Document No.`, or empty. **Never assume the prefix** — an unprefixed note is
 * returned whole, with no language.
 */
export function developerHint(note: string | undefined): DeveloperHint | undefined {
    if (note === undefined || note === '') {
        return undefined;
    }

    const match = LANGUAGE_PREFIX.exec(note);
    return match === null
        ? { text: note }
        : { language: match[1], text: match[2] };
}

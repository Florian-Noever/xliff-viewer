import { alNameHash } from './alNameHash';
import { canonicalHash, parseUnitId } from './unitId';
import { NAMESPACE_TYPE, SEGMENT_SEPARATOR } from '../../shared/unitPath';

import type { UnitIdSegment } from './unitId';
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

/** What the `Xliff Generator` note says, read against the id it belongs to. */
export interface GeneratorNoteReading {
    /** The object the note names: the one that declares the element, not always the id's root. */
    readonly declaring: { readonly type: string; readonly name: string; readonly namespace?: string };
    /** One name per id segment after the root and any `Namespace` segment. */
    readonly names: readonly string[];
}

const NAMESPACE_PREFIX = `${NAMESPACE_TYPE} `;
/** How many ways of splitting one note are weighed, and how many anchors tried, at most. */
const MAX_SPLITS = 32;
const MAX_STEPS = 256;

/**
 * Reads the `Xliff Generator` note against the id's segments.
 *
 * Splitting the note on ` - ` is the obvious approach and is **wrong**: AL names can contain
 * that separator (`Report Sales - Quote`). The id's segment types are the anchors instead:
 * each name runs up to ` - <next type> `. Where a name could stop at more than one anchor,
 * the split whose names hash to the id's segments wins — the first split, when none does:
 *
 * ```text
 * id    Report 339834252 - Property 2879900210
 * note  Report Sales - Property List - Property Caption
 * →     declaring Report "Sales - Property List", names [Caption]
 * ```
 *
 * The root's type is left open: the note names the object that **declares** the element,
 * and a folded extension's id is filed under the object it extends. A namespaced app's note
 * begins `Namespace X - `, whether its id is readable or hashed.
 */
export function readGeneratorNote(segments: readonly UnitIdSegment[], note: string | undefined): GeneratorNoteReading | undefined {
    if (note === undefined || note === '') {
        return undefined;
    }

    let text = note;
    let namespace: string | undefined;
    if (text.startsWith(NAMESPACE_PREFIX)) {
        const end = text.indexOf(SEGMENT_SEPARATOR, NAMESPACE_PREFIX.length);
        if (end < 0) {
            return undefined;
        }
        namespace = text.slice(NAMESPACE_PREFIX.length, end);
        text = text.slice(end + SEGMENT_SEPARATOR.length);
    }
    const space = text.indexOf(' ');
    if (space <= 0) {
        return undefined;
    }
    const type = text.slice(0, space);

    const offset = segments.at(0)?.type === NAMESPACE_TYPE ? 1 : 0;
    const root = segments.at(offset);
    const rest = segments.slice(offset + 1);
    const hashes = [root?.type === type ? canonicalHash(root) : undefined, ...rest.map(canonicalHash)];

    let best: { readonly names: readonly string[]; readonly score: number } | undefined;
    for (const names of noteSplits(text.slice(space + 1), rest.map(segment => segment.type))) {
        const score = names.filter((name, index) => alNameHash(name) === hashes[index]).length;
        if (best === undefined || score > best.score) {
            best = { names, score };
        }
    }
    if (best === undefined) {
        return undefined;
    }
    const [name, ...names] = best.names;
    return { declaring: { type, name, ...(namespace === undefined ? {} : { namespace }) }, names };
}

/**
 * The ways a note's body — a root name, then ` - <type> <name>` per type — can be split,
 * earliest anchors first. Bounded, so a note full of separators costs no more than a few.
 */
function noteSplits(body: string, types: readonly string[]): string[][] {
    const splits: string[][] = [];
    let steps = MAX_STEPS;
    const visit = (rest: string, level: number, names: readonly string[]): void => {
        if (level === types.length) {
            splits.push([...names, rest]);
            return;
        }
        const anchor = `${SEGMENT_SEPARATOR}${types[level]} `;
        for (let at = rest.indexOf(anchor, 1); at > 0 && steps > 0 && splits.length < MAX_SPLITS; at = rest.indexOf(anchor, at + 1)) {
            steps--;
            const tail = rest.slice(at + anchor.length);
            if (tail !== '') {
                visit(tail, level + 1, [...names, rest.slice(0, at)]);
            }
        }
    };
    if (body !== '') {
        visit(body, 0, []);
    }
    return splits;
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

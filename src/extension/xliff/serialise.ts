import type {
    Eol,
    XliffAttributes,
    XliffBody,
    XliffDocument,
    XliffFile,
    XliffGroup,
    XliffNote,
    XliffTarget,
    XliffTransUnit,
} from '../../shared/model';

/**
 * Model → text, byte-faithful.
 *
 * Not `XMLBuilder`: it reformats every line, and with `format: true` it also indents inside
 * `xml:space="preserve"` content.
 *
 * Everything here is driven by the `attributes` bag rather than the named fields — that is
 * what carries `xmlns:xsi`, `xsi:schemaLocation` and anything else we never enumerated.
 */

const INDENT = '  ';

/** XML parsing reads every line break in text as LF, so text is written back with the file's own. */
const LINE_BREAK = /\r\n|\r|\n/g;

/** Text content: AL encodes `>` even where XML makes it optional, so match that. */
export function encodeText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Attribute values additionally need `"`, since attributes are double-quoted. */
export function encodeAttribute(value: string): string {
    return encodeText(value).replace(/"/g, '&quot;');
}

/** Each attribute as ` name="value"`, in the order the bag holds them. */
export function renderAttributes(attributes: XliffAttributes): string {
    return Object.entries(attributes)
        .map(([name, value]) => ` ${name}="${encodeAttribute(value)}"`)
        .join('');
}

/**
 * A leaf element on one line. Empty content produces the self-closing form with **no
 * space** before `/>`, which is what AL itself emits.
 */
function renderLeaf(tag: string, attributes: XliffAttributes, value: string, depth: number, eol: Eol): string {
    const open = `${INDENT.repeat(depth)}<${tag}${renderAttributes(attributes)}`;
    return value === ''
        ? `${open}/>`
        : `${open}>${encodeText(value).replace(LINE_BREAK, eol)}</${tag}>`;
}

function renderNote(note: XliffNote, depth: number, eol: Eol): string[] {
    return [renderLeaf('note', note.attributes, note.value, depth, eol)];
}

function renderTarget(target: XliffTarget, depth: number, eol: Eol): string[] {
    return [renderLeaf('target', target.attributes, target.value, depth, eol)];
}

function renderTransUnit(unit: XliffTransUnit, depth: number, eol: Eol): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<trans-unit${renderAttributes(unit.attributes)}>`,
        renderLeaf('source', {}, unit.source, depth + 1, eol),
        ...(unit.target === undefined ? [] : renderTarget(unit.target, depth + 1, eol)),
        ...unit.notes.flatMap(note => renderNote(note, depth + 1, eol)),
        `${pad}</trans-unit>`,
    ];
}

function renderGroup(group: XliffGroup, depth: number, eol: Eol): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<group${renderAttributes(group.attributes)}>`,
        ...group.units.flatMap(unit => renderTransUnit(unit, depth + 1, eol)),
        ...group.groups.flatMap(child => renderGroup(child, depth + 1, eol)),
        `${pad}</group>`,
    ];
}

function renderBody(body: XliffBody, depth: number, eol: Eol): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<body${renderAttributes(body.attributes)}>`,
        ...body.units.flatMap(unit => renderTransUnit(unit, depth + 1, eol)),
        ...body.groups.flatMap(group => renderGroup(group, depth + 1, eol)),
        `${pad}</body>`,
    ];
}

function renderFile(file: XliffFile, depth: number, eol: Eol): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<file${renderAttributes(file.attributes)}>`,
        ...renderBody(file.body, depth + 1, eol),
        `${pad}</file>`,
    ];
}

/**
 * Serialises the whole document. The `format` record is reproduced exactly — BOM,
 * declaration, line ending and trailing newline are facts about the file, never
 * preferences to normalise.
 */
export function serialiseXliff(document: XliffDocument): string {
    const { hasBom, declaration, eol, hasTrailingNewline } = document.format;
    const lines = [
        `<xliff${renderAttributes(document.attributes)}>`,
        ...document.files.flatMap(file => renderFile(file, 1, eol)),
        '</xliff>',
    ];

    const head = declaration === '' ? '' : declaration + eol;

    return (hasBom ? '﻿' : '')
        + head
        + lines.join(eol)
        + (hasTrailingNewline ? eol : '');
}

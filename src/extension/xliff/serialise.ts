import type {
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

/** Text content: AL encodes `>` even where XML makes it optional, so match that. */
function encodeText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Attribute values additionally need `"`, since attributes are double-quoted. */
function encodeAttribute(value: string): string {
    return encodeText(value).replace(/"/g, '&quot;');
}

function renderAttributes(attributes: XliffAttributes): string {
    return Object.entries(attributes)
        .map(([name, value]) => ` ${name}="${encodeAttribute(value)}"`)
        .join('');
}

/**
 * A leaf element on one line. Empty content produces the self-closing form with **no
 * space** before `/>`, which is what AL itself emits.
 */
function renderLeaf(tag: string, attributes: XliffAttributes, value: string, depth: number): string {
    const open = `${INDENT.repeat(depth)}<${tag}${renderAttributes(attributes)}`;
    return value === ''
        ? `${open}/>`
        : `${open}>${encodeText(value)}</${tag}>`;
}

function renderNote(note: XliffNote, depth: number): string[] {
    return [renderLeaf('note', note.attributes, note.value, depth)];
}

function renderTarget(target: XliffTarget, depth: number): string[] {
    return [renderLeaf('target', target.attributes, target.value, depth)];
}

function renderTransUnit(unit: XliffTransUnit, depth: number): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<trans-unit${renderAttributes(unit.attributes)}>`,
        renderLeaf('source', {}, unit.source, depth + 1),
        ...(unit.target === undefined ? [] : renderTarget(unit.target, depth + 1)),
        ...unit.notes.flatMap(note => renderNote(note, depth + 1)),
        `${pad}</trans-unit>`,
    ];
}

function renderGroup(group: XliffGroup, depth: number): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<group${renderAttributes(group.attributes)}>`,
        ...group.units.flatMap(unit => renderTransUnit(unit, depth + 1)),
        ...group.groups.flatMap(child => renderGroup(child, depth + 1)),
        `${pad}</group>`,
    ];
}

function renderBody(body: XliffBody, depth: number): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<body${renderAttributes(body.attributes)}>`,
        ...body.units.flatMap(unit => renderTransUnit(unit, depth + 1)),
        ...body.groups.flatMap(group => renderGroup(group, depth + 1)),
        `${pad}</body>`,
    ];
}

function renderFile(file: XliffFile, depth: number): string[] {
    const pad = INDENT.repeat(depth);
    return [
        `${pad}<file${renderAttributes(file.attributes)}>`,
        ...renderBody(file.body, depth + 1),
        `${pad}</file>`,
    ];
}

/**
 * Serialises the whole document. The `format` record is reproduced exactly — BOM,
 * declaration, line ending and trailing newline are facts about the file, never
 * preferences to normalise.
 */
export function serialiseXliff(document: XliffDocument): string {
    const lines = [
        `<xliff${renderAttributes(document.attributes)}>`,
        ...document.files.flatMap(file => renderFile(file, 1)),
        '</xliff>',
    ];

    const { hasBom, declaration, eol, hasTrailingNewline } = document.format;
    const head = declaration === '' ? '' : declaration + eol;

    return (hasBom ? '﻿' : '')
        + head
        + lines.join(eol)
        + (hasTrailingNewline ? eol : '');
}

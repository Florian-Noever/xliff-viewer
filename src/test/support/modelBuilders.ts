/**
 * Raw-model values for tests that build a document by hand. Each builder fills in what the
 * model requires, so a test spells out only what it is about.
 */

import { NoteFrom } from '../../shared/notes';

import type { XliffDocument, XliffFile, XliffGroup, XliffTarget, XliffTransUnit } from '../../shared/model';

type UnitFields = Partial<Omit<XliffTransUnit, 'attributes' | 'id'>>;

/** A translatable unit with source `s`, no target and no notes, unless `fields` says otherwise. */
export function unit(id: string, fields: UnitFields = {}): XliffTransUnit {
    return { attributes: { id }, id, translate: true, source: 's', notes: [], ...fields };
}

/** A unit carrying the note the generator writes: its path, by name. */
export function notedUnit(id: string, generatorNote: string): XliffTransUnit {
    return unit(id, { notes: [{ attributes: { from: NoteFrom.generator }, from: NoteFrom.generator, value: generatorNote }] });
}

/** A target, with its `state` among the attributes too when it has one. */
export function target(value: string, state?: string): XliffTarget {
    return { attributes: state === undefined ? {} : { state }, state, value };
}

export function group(units: readonly XliffTransUnit[], groups: readonly XliffGroup[] = []): XliffGroup {
    return { attributes: {}, units, groups };
}

/** An `en-US` file whose body holds these units and groups. */
export function file(units: readonly XliffTransUnit[], groups: readonly XliffGroup[] = []): XliffFile {
    return { attributes: {}, sourceLanguage: 'en-US', body: { attributes: {}, units, groups } };
}

/** An XLIFF 1.2 document, written with LF line endings and no BOM. */
export function document(files: readonly XliffFile[]): XliffDocument {
    return {
        attributes: { version: '1.2' },
        version: '1.2',
        files,
        format: { hasBom: false, declaration: '<?xml version="1.0"?>', eol: '\n', hasTrailingNewline: false },
    };
}

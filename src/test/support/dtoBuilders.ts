/**
 * Payloads as the host posts them, for webview tests. Each builder fills in what the DTO
 * requires, so a test spells out only what it is about.
 */

import { OBJECT_TYPE_GROUP_PREFIX } from '../../extension/xliff/alTree';
import { XliffState } from '../../shared/state';
import { splitUnitId } from '../../shared/unitPath';

import type { AlNodeDto, TransUnitDto, XliffDocumentDto, XliffFileDto } from '../../shared/dto';

type UnitFields = Partial<Omit<TransUnitDto, 'id'>>;
type NodeFields = Partial<Omit<AlNodeDto, 'key' | 'children'>>;

/** A translated unit whose source is its id, with no target and no notes unless `fields` says otherwise. */
export function unitDto(id: string, fields: UnitFields = {}): TransUnitDto {
    return { id, source: id, state: XliffState.translated, translate: true, notes: [], ...fields };
}

/** The one unit a single-unit test is about: translated, with an example source and target. */
export function exampleUnitDto(fields: Partial<TransUnitDto> = {}): TransUnitDto {
    return { ...unitDto('Table 1 - Property 2', { source: 'ExampleSourceText', target: 'ExampleTranslation' }), ...fields };
}

/** A node of the type its key's last segment names. A test that shows names gives one. */
export function nodeDto(key: string, children: readonly AlNodeDto[] = [], fields: NodeFields = {}): AlNodeDto {
    const [type] = (splitUnitId(key).at(-1) ?? key).split(' ');
    return { key, type, children, ...fields };
}

/** The host's key for the group of `type` objects, inside the namespace node `namespaceKey` if there is one. */
export function groupKey(type: string, namespaceKey?: string): string {
    return namespaceKey === undefined ? `${OBJECT_TYPE_GROUP_PREFIX}${type}` : `${OBJECT_TYPE_GROUP_PREFIX}${namespaceKey}/${type}`;
}

/** File 0 of a document, `en-US` into `de-DE`, with AL ids. */
export function fileDto(fields: Partial<XliffFileDto> = {}): XliffFileDto {
    return { index: 0, sourceLanguage: 'en-US', targetLanguage: 'de-DE', tree: [], units: [], hasAlIds: true, ...fields };
}

/** An editable language file holding these files. */
export function documentDto(files: readonly XliffFileDto[], fields: Partial<XliffDocumentDto> = {}): XliffDocumentDto {
    return { uri: 'file:///w/App.de-DE.xlf', fileName: 'App.de-DE.xlf', isBaseFile: false, readOnly: false, files, ...fields };
}

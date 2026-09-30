import { buildAlTree, groupRoots, isNamespaceNode } from './alTree';
import { developerHint, developerNote, GENERATOR_NOTE_FROM, hasAlStructure } from './names';

import { iterateFileUnits } from '../../shared/model';
import { effectiveState, isSpecState } from '../../shared/state';

import type { AlNodeDto, BaseFileDto, TransUnitDto, XliffDocumentDto, XliffFileDto } from '../../shared/dto';
import type { AlNode, XliffDocument, XliffFile, XliffTransUnit } from '../../shared/model';

/**
 * Projects the parsed model into the webview payload.
 *
 * Runs in the host, once per load, over a document that has already been through
 * `validateStructure` — which is what guarantees each file's ids are unique and therefore
 * that no unit is lost to a `Record` key collision.
 */

const BASE_FILE_SUFFIX = '.g.xlf';

/** What the editor knows and the model does not. */
export interface DocumentContext {
    readonly uri: string;
    readonly fileName: string;
    /** Defaults to `isBaseFile`; pass it to force a document read-only for another reason. */
    readonly readOnly?: boolean;
    /** `null` when resolution ran and found nothing. Omit while it has not run. */
    readonly baseFile?: BaseFileDto | null;
}

export function projectDocument(document: XliffDocument, context: DocumentContext): XliffDocumentDto {
    const files = document.files.map((file, index) => projectFile(file, index));
    const isBaseFile = looksLikeBaseFile(document, context.fileName);

    return {
        uri: context.uri,
        fileName: context.fileName,
        isBaseFile,
        readOnly: context.readOnly ?? isBaseFile,
        files,
        baseFile: context.baseFile,
    };
}

/**
 * A `.g.xlf` by name, or a file that carries no `<target>` at all **and** declares the same
 * source and target language.
 *
 * Both halves are needed: a language file freshly synced from the base also has no targets,
 * and a language file may translate into its own source language, en-US into en-US.
 */
function looksLikeBaseFile(document: XliffDocument, fileName: string): boolean {
    if (fileName.toLowerCase().endsWith(BASE_FILE_SUFFIX)) {
        return true;
    }

    let sawUnit = false;
    for (const file of document.files) {
        if (file.targetLanguage !== file.sourceLanguage) {
            return false;
        }
        for (const unit of iterateFileUnits(file)) {
            if (unit.target !== undefined) {
                return false;
            }
            sawUnit = true;
        }
    }
    return sawUnit;
}

function projectFile(file: XliffFile, index: number): XliffFileDto {
    const models = [...iterateFileUnits(file)];
    const hasAlIds = models.some(unit => hasAlStructure(unit.id));
    const roots = buildAlTree(models);
    const namespaced = hasAlIds && roots.some(isNamespaceNode);

    return {
        index,
        sourceLanguage: file.sourceLanguage,
        targetLanguage: file.targetLanguage,
        original: file.original,
        datatype: file.datatype,
        // A file with no AL structure has no types to group by, and its flat list is
        // already the right answer.
        tree: projectNodes(hasAlIds ? groupRoots(roots) : roots),
        units: models.map(projectUnit),
        hasAlIds,
        ...(namespaced ? { namespaced: true as const } : {}),
    };
}

/**
 * Exported so an edit can rebuild the one unit that changed rather than re-projecting the
 * whole document. There must be exactly one projection, or a patched unit and its
 * neighbours start disagreeing about what a unit looks like.
 */
export function projectUnit(unit: XliffTransUnit): TransUnitDto {
    const declared = unit.target?.state;
    const state = effectiveState(unit);

    return {
        id: unit.id,
        source: unit.source,
        target: unit.target?.value,
        state,
        rawState: declared !== undefined && !isSpecState(declared) ? declared : undefined,
        declaredState: isSpecState(declared) && declared !== state ? declared : undefined,
        translate: unit.translate,
        maxwidth: unit.maxwidth,
        sizeUnit: unit.sizeUnit,
        alObjectTarget: unit.alObjectTarget,
        notes: unit.notes
            .filter(note => note.from !== GENERATOR_NOTE_FROM)
            .map(note => ({ from: note.from, value: note.value })),
        developerHint: developerHint(developerNote(unit))?.text,
    };
}

function projectNodes(nodes: readonly AlNode[]): AlNodeDto[] {
    return nodes.map(node => ({
        key: node.key,
        type: node.segment.type,
        name: node.segment.name,
        children: projectNodes(node.children),
        group: node.synthetic,
    }));
}

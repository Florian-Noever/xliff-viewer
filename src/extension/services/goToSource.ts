import * as vscode from 'vscode';

import { unitTarget } from '../al/alTarget';
import { Logger } from './logger';
import { revealAsText, revealInBaseFile } from './navigation';
import { showTransientNotice } from './transientNotice';
import { fileNameOf } from './uriNames';

import type { AlSourceIndexes } from './alSourceIndex';
import type { BaseFileResolver } from './baseFileResolver';
import type { UnitLocation } from '../al/unitLocator';

/**
 * "Go to source": the AL declaration of a unit, else the unit in the base file.
 *
 * The declaration is opened with its declaring token selected — the property, the label,
 * or, where the source has no line for the unit, the member or the object that stands for
 * it. Several equally good declarations are offered to choose from, never guessed between.
 * Only when no declaration is found does the base file open, with a notice saying so that
 * goes away by itself; in a base file, that is the unit in the file itself.
 */

export interface SourceRequest {
    /** The translation file the unit is in. */
    readonly document: vscode.Uri;
    readonly isBaseFile: boolean;
    readonly unitId: string;
    readonly generatorNote?: string;
    readonly alObjectTarget?: string;
}

export const SourceOutcome = {
    declaration: 'declaration',
    baseFile: 'baseFile',
    ownFile: 'ownFile',
    cancelled: 'cancelled',
    nowhere: 'nowhere',
} as const;
export type SourceOutcome = typeof SourceOutcome[keyof typeof SourceOutcome];

export async function goToSource(request: SourceRequest, alSources: AlSourceIndexes | undefined, baseFiles: BaseFileResolver | undefined): Promise<SourceOutcome> {
    const declared = await openDeclaration(request, alSources);
    return declared ?? await openFallback(request, baseFiles);
}

/** The AL declaration, when the app has one; undefined sends the caller to the fallback. */
async function openDeclaration(request: SourceRequest, alSources: AlSourceIndexes | undefined): Promise<SourceOutcome | undefined> {
    const target = unitTarget(request.unitId, request.generatorNote, request.alObjectTarget);
    if (target === undefined || alSources === undefined) {
        return undefined;
    }

    try {
        const index = await alSources.forFile(request.document);
        if (index === undefined) {
            return undefined;
        }
        const { result, documents } = await index.locate(target);
        switch (result.kind) {
            case 'found':
                await revealDeclaration(documents, result.location);
                return SourceOutcome.declaration;
            case 'ambiguous': {
                const chosen = await pickDeclaration(documents, result.locations);
                if (chosen === undefined) {
                    return SourceOutcome.cancelled;
                }
                await revealDeclaration(documents, chosen);
                return SourceOutcome.declaration;
            }
            default:
                Logger.info(`No AL declaration found for ${request.unitId} in ${index.scope.folder.path}.`);
                return undefined;
        }
    } catch (error: unknown) {
        // The AL source is the better answer, not the only one: the base file still is.
        Logger.warn(`Looking for the AL source of ${request.unitId} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        return undefined;
    }
}

/** The unit in the base file, or in this file when it is the base file. */
async function openFallback(request: SourceRequest, baseFiles: BaseFileResolver | undefined): Promise<SourceOutcome> {
    if (request.isBaseFile) {
        await revealAsText(request.document, request.unitId);
        showTransientNotice('The AL source for this unit was not found, so it is shown in this file instead.');
        return SourceOutcome.ownFile;
    }

    const base = (await baseFiles?.resolve(request.document, false))?.uri;
    if (base !== undefined && await revealInBaseFile(base, request.unitId)) {
        showTransientNotice(`The AL source for this unit was not found, so it is shown in ${fileNameOf(base)} instead.`);
        return SourceOutcome.baseFile;
    }

    void vscode.window.showInformationMessage(base === undefined
        ? 'The AL source for this unit was not found, and no base file was found for this translation file.'
        : `The AL source for this unit was not found, and the base file does not contain "${request.unitId}". It may have been removed since this translation was made.`);
    return SourceOutcome.nowhere;
}

/** Opens the declaration with its declaring token selected and in the middle of the view. */
async function revealDeclaration(documents: ReadonlyMap<string, vscode.TextDocument>, location: UnitLocation): Promise<void> {
    const document = documents.get(location.file);
    if (document === undefined) {
        return;
    }
    const selection = new vscode.Range(document.positionAt(location.range.start), document.positionAt(location.range.end));
    Logger.info(`Opening ${document.uri.path}:${selection.start.line + 1} (${location.precision}, tier ${location.tier}).`);
    const editor = await vscode.window.showTextDocument(document, { selection, preview: false });
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
}

/**
 * Several declarations fit equally well — two apps in one workspace, say — so the reader
 * picks. Such files are usually named alike, so the folder is what tells them apart.
 */
async function pickDeclaration(documents: ReadonlyMap<string, vscode.TextDocument>, locations: readonly UnitLocation[]): Promise<UnitLocation | undefined> {
    const items = locations.flatMap((location) => {
        const document = documents.get(location.file);
        if (document === undefined) {
            return [];
        }
        const line = document.positionAt(location.range.start).line + 1;
        return [{ label: `${fileNameOf(document.uri)}:${line}`, description: vscode.workspace.asRelativePath(document.uri), location }];
    });
    const chosen = await vscode.window.showQuickPick(items, {
        title: 'Several AL declarations match this unit',
        placeHolder: 'Choose the one to open',
        matchOnDescription: true,
    });
    return chosen?.location;
}

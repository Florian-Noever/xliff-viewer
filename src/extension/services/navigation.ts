import * as vscode from 'vscode';

import { Logger } from './logger';
import { encodeAttribute } from '../xliff/serialise';
import { escapeRegExp } from '../../shared/escapeRegExp';

/**
 * Getting back to the file.
 *
 * The viewer hides the XML on purpose, so the way back to it has to be reliable: the error
 * pane's "open as text" works in every host, whatever state the document is in, and "Go to
 * source" lands here whenever it falls back to a base file.
 */

const DEFAULT_EDITOR = 'default';
const OPEN_WITH_COMMAND = 'vscode.openWith';

/**
 * Where a unit's `<trans-unit>` starts, as an offset into the text, or undefined when the
 * text does not contain it.
 *
 * Searches the document text rather than remembering an offset: there are none in the
 * model, and one remembered here would be wrong after the first edit. It is O(document)
 * per call — fine for a click, but never to be called while rendering.
 */
export function findUnitOffset(text: string, unitId: string): number | undefined {
    // Anchored to the element: an id also appears inside the Xliff Generator note of other
    // units, and matching one of those would send the reader to the wrong place.
    for (const candidate of [encodeAttribute(unitId), unitId]) {
        const pattern = new RegExp(`<trans-unit[^>]*\\sid="${escapeRegExp(candidate)}"`);
        const match = pattern.exec(text);
        if (match !== null) {
            return match.index;
        }
    }
    return undefined;
}

/**
 * Opens a document with the built-in text editor and, when a unit is named, puts the
 * cursor on its line.
 *
 * `vscode.openWith` with `default` rather than `showTextDocument`, because our own editor
 * claims `.xlf` and this is the documented way to ask for a different one.
 */
export async function revealAsText(uri: vscode.Uri, unitId?: string): Promise<void> {
    await vscode.commands.executeCommand(OPEN_WITH_COMMAND, uri, DEFAULT_EDITOR);

    if (unitId === undefined) {
        return;
    }

    const editor = editorFor(uri);
    if (editor === undefined) {
        // The file is open, which is most of what was asked for. Not being able to scroll
        // it is not worth an error the user has to dismiss.
        Logger.warn(`Opened ${uri.path} as text but could not find its editor to reveal ${unitId}.`);
        return;
    }

    const offset = findUnitOffset(editor.document.getText(), unitId);
    if (offset === undefined) {
        Logger.warn(`Unit "${unitId}" was not found in ${uri.path}.`);
        return;
    }

    const position = new vscode.Position(editor.document.positionAt(offset).line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

/**
 * Opens the resolved base file at the same unit.
 *
 * As text, not in this viewer: revealing a unit inside our own tree needs a message the
 * protocol does not have, and this escape hatch is meant to reach the XML anyway.
 * Returns false when the base file does not contain the id, so the caller can say so.
 */
export async function revealInBaseFile(baseUri: vscode.Uri, unitId: string): Promise<boolean> {
    let text: string;
    try {
        text = new TextDecoder().decode(await vscode.workspace.fs.readFile(baseUri));
    } catch (error: unknown) {
        Logger.warn(`Could not read the base file ${baseUri.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
        return false;
    }

    if (findUnitOffset(text, unitId) === undefined) {
        return false;
    }

    await revealAsText(baseUri, unitId);
    return true;
}

function editorFor(uri: vscode.Uri): vscode.TextEditor | undefined {
    const wanted = uri.toString();
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === wanted)
        ?? (vscode.window.activeTextEditor?.document.uri.toString() === wanted ? vscode.window.activeTextEditor : undefined);
}

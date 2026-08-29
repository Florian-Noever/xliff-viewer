import * as vscode from 'vscode';

import { Logger } from './logger';

/**
 * Getting back to the file (MASTER_PLAN §10.2, §10.3).
 *
 * The viewer hides the XML on purpose, so the way back to it has to be reliable: "open as
 * text" is available for every unit, in every host, whatever state the document is in.
 */

const DEFAULT_EDITOR = 'default';
const OPEN_WITH_COMMAND = 'vscode.openWith';

/**
 * Where a unit's `<trans-unit>` starts, as a zero-based line, or undefined when the text
 * does not contain it.
 *
 * Searches the document text rather than remembering an offset: there are none in the
 * model (`DEC-017`), and one remembered here would be wrong after the first edit. It is
 * O(document) per call — fine for a click, which is why the risk note says never to call
 * it while rendering.
 */
export function findUnitLine(text: string, unitId: string): number | undefined {
    const index = indexOfUnit(text, unitId);
    if (index === undefined) {
        return undefined;
    }
    let line = 0;
    for (let at = 0; at < index; at++) {
        if (text.charCodeAt(at) === 10) {
            line++;
        }
    }
    return line;
}

function indexOfUnit(text: string, unitId: string): number | undefined {
    // Anchored to the element: an id also appears inside the Xliff Generator note of other
    // units, and matching one of those would send the reader to the wrong place.
    for (const candidate of [escapeAttribute(unitId), unitId]) {
        const pattern = new RegExp(`<trans-unit[^>]*\\sid="${escapeRegex(candidate)}"`);
        const match = pattern.exec(text);
        if (match !== null) {
            return match.index;
        }
    }
    return undefined;
}

/** What the serialiser writes into an attribute, so the search matches the file on disk. */
function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Opens a document with the built-in text editor and, when a unit is named, puts the
 * cursor on its line.
 *
 * `vscode.openWith` with `default` rather than `showTextDocument`, because our own editor
 * claims `.xlf` and this is the documented way to ask for a different one (§10.3).
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

    const line = findUnitLine(editor.document.getText(), unitId);
    if (line === undefined) {
        Logger.warn(`Unit "${unitId}" was not found in ${uri.path}.`);
        return;
    }

    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

/**
 * Opens the resolved base file at the same unit (§10.2).
 *
 * As text, not in this viewer: revealing a unit inside our own tree needs a message the
 * protocol does not have, and the escape hatch the user asked for is the XML anyway.
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

    if (findUnitLine(text, unitId) === undefined) {
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

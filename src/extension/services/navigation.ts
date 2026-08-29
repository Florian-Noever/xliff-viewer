import * as vscode from 'vscode';

import { Logger } from './logger';
import { findMemberLine } from './alObjectIndex';

import type { AlDeclaration, AlObjectIndex } from './alObjectIndex';
import type { AlNodeDto } from '../../shared/dto';

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

/** The object and, when the id has one, the member the reader wants to land on (§10.1). */
export interface AlTarget {
    readonly kind: string;
    readonly name: string;
    readonly memberName?: string;
}

/**
 * Reads the target out of the tree the webview is already showing (§4.3, §10.1).
 *
 * The names come from the generator note, which `TREE-01` already parsed into the nodes —
 * so this needs neither the note nor the model, only the id and the tree.
 *
 * The **root** segment names the object. The member is the segment after it, and only when
 * the id goes deeper than object → property: in `Table X - Property Y` the property *is*
 * the translated element, not a member to reveal.
 */
export function alTargetFor(unitId: string, tree: readonly AlNodeDto[]): AlTarget | undefined {
    const segments = unitId.split(' - ');
    const root = tree.find(node => node.key === segments[0]);
    if (root?.name === undefined) {
        return undefined;
    }

    if (segments.length < 3) {
        return { kind: root.type, name: root.name };
    }

    const memberKey = `${segments[0]} - ${segments[1]}`;
    const member = root.children.find(node => node.key === memberKey);
    return { kind: root.type, name: root.name, memberName: member?.name };
}

export const AlNavigationOutcome = {
    opened: 'opened',
    noAlFiles: 'noAlFiles',
    notFound: 'notFound',
    cancelled: 'cancelled',
} as const;
export type AlNavigationOutcome = typeof AlNavigationOutcome[keyof typeof AlNavigationOutcome];

/**
 * Opens the `.al` file that declares the object, and reveals the member inside it when the
 * id names one (§10.1).
 *
 * Several matches ask rather than guess; none says so rather than opening something close.
 */
export async function revealAlObject(index: AlObjectIndex, target: AlTarget): Promise<AlNavigationOutcome> {
    const declarations = await index.find(target.kind, target.name);

    if (declarations.length === 0) {
        return (await index.hasAlFiles()) ? AlNavigationOutcome.notFound : AlNavigationOutcome.noAlFiles;
    }

    const chosen = declarations.length === 1 ? declarations[0] : await pick(declarations);
    if (chosen === undefined) {
        return AlNavigationOutcome.cancelled;
    }

    const document = await vscode.workspace.openTextDocument(chosen.uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });

    const line = target.memberName === undefined
        ? chosen.line
        : findMemberLine(document.getText(), target.memberName) ?? chosen.line;

    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

    return AlNavigationOutcome.opened;
}

/** Two objects can share a name across apps in one workspace; the reader decides which. */
async function pick(declarations: readonly AlDeclaration[]): Promise<AlDeclaration | undefined> {
    const items = declarations.map(declaration => ({
        label: `${declaration.kind} ${declaration.name}`,
        description: `${declaration.uri.path}:${declaration.line + 1}`,
        declaration,
    }));

    const chosen = await vscode.window.showQuickPick(items, {
        title: 'Several objects have this name',
        placeHolder: 'Choose the one to open',
    });
    return chosen?.declaration;
}

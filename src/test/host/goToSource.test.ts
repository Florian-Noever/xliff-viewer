import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AlSourceIndexes } from '../../extension/services/alSourceIndex';
import { BaseFileResolver } from '../../extension/services/baseFileResolver';
import { goToSource, SourceOutcome } from '../../extension/services/goToSource';
import { showTransientNotice } from '../../extension/services/transientNotice';
import { alNameHash } from '../../extension/xliff/alNameHash';
import {
    flushExecutedCommands,
    flushInfoMessages,
    flushProgress,
    flushQuickPicks,
    flushRevealedPositions,
    flushShownDocuments,
    removeVirtualFile,
    setQuickPickResult,
    setVirtualFile,
    setWorkspaceRoot,
} from '../__mocks__/vscode';

import type { SourceRequest } from '../../extension/services/goToSource';

const h = alNameHash;
const APP = '/w/app';
const LANGUAGE = `${APP}/Translations/Contoso.de-DE.xlf`;
const BASE = `${APP}/Translations/Contoso.g.xlf`;
const ORDER_FILE = `${APP}/src/Order.Table.al`;

const ORDER = [
    'table 50100 "Contoso Order"',
    '{',
    '    Caption = \'Contoso Order\';',
    '',
    '    fields',
    '    {',
    '        field(1; "No."; Code[20]) { }',
    '    }',
    '}',
    '',
].join('\n');

const CAPTION = `Table ${h('Contoso Order')} - Property ${h('Caption')}`;
const FIELD_CAPTION = `Table ${h('Contoso Order')} - Field ${h('No.')} - Property ${h('Caption')}`;
const MISSING_FIELD = `Table ${h('Contoso Order')} - Field ${h('Contoso Gone')} - Property ${h('Caption')}`;
const UNDECLARED = `Table ${h('Contoso Invoice')} - Property ${h('Caption')}`;

function baseFile(...ids: readonly string[]): string {
    const units = ids.map(id => `      <trans-unit id="${id}"><source>x</source></trans-unit>`);
    return ['<xliff version="1.2">', '  <file source-language="en-US" target-language="en-US">', '    <body>', ...units, '    </body>', '  </file>', '</xliff>', ''].join('\n');
}

function request(unitId: string, overrides: Partial<SourceRequest> = {}): SourceRequest {
    return { document: vscode.Uri.file(LANGUAGE), isBaseFile: false, unitId, ...overrides };
}

function offsetAt(text: string, position: { readonly line: number; readonly character: number }): number {
    const lines = text.split('\n');
    let offset = position.character;
    for (let line = 0; line < position.line; line++) {
        offset += lines[line].length + 1;
    }
    return offset;
}

/** Where the one document shown was shown, and what its selection covers. */
function shownSelection(text: string): { path: string; selected: string } {
    const shown = flushShownDocuments();
    expect(shown).toHaveLength(1);
    const { path, selection } = shown[0];
    expect(selection).toBeDefined();
    return { path, selected: selection === undefined ? '' : text.slice(offsetAt(text, selection.start), offsetAt(text, selection.end)) };
}

let alSources: AlSourceIndexes;
let baseFiles: BaseFileResolver;

beforeEach(() => {
    // A fallback to the base file starts a notice that closes itself five seconds later.
    vi.useFakeTimers();
    setWorkspaceRoot('/w');
    setVirtualFile(`${APP}/app.json`, '{}');
    setVirtualFile(ORDER_FILE, ORDER);
    setVirtualFile(LANGUAGE, '<xliff/>');
    setVirtualFile(BASE, baseFile(CAPTION, UNDECLARED));
    alSources = new AlSourceIndexes();
    baseFiles = new BaseFileResolver();
});

afterEach(() => {
    alSources.dispose();
    baseFiles.dispose();
});

describe('goToSource, when the AL source declares the unit', () => {
    it('opens the declaration with the declaring token selected, and in view', async () => {
        const outcome = await goToSource(request(CAPTION, { generatorNote: 'Table Contoso Order - Property Caption' }), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.declaration);
        expect(shownSelection(ORDER)).toEqual({ path: ORDER_FILE, selected: 'Caption' });
        expect(flushRevealedPositions()).toEqual([{ path: ORDER_FILE, line: 2 }]);
        expect(flushInfoMessages()).toEqual([]);
        expect(flushProgress().filter(record => record.location === vscode.ProgressLocation.Notification)).toEqual([]);
    });

    it('opens the member where the source has no line for the unit itself', async () => {
        // A field without a caption still has one in the translation file.
        const outcome = await goToSource(request(FIELD_CAPTION), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.declaration);
        expect(shownSelection(ORDER).selected).toContain('No.');
    });

    it('opens the object where not even the member is found', async () => {
        const outcome = await goToSource(request(MISSING_FIELD), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.declaration);
        expect(shownSelection(ORDER).selected).toContain('Contoso Order');
        expect(flushRevealedPositions()).toEqual([{ path: ORDER_FILE, line: 0 }]);
    });

    it('offers equally good declarations to choose from, and opens the one chosen', async () => {
        setVirtualFile(`${APP}/src/Copy/Order.Table.al`, ORDER);
        setQuickPickResult(1);

        const outcome = await goToSource(request(CAPTION), alSources, baseFiles);

        const [offered] = flushQuickPicks();
        expect(outcome).toBe(SourceOutcome.declaration);
        expect(offered.map(item => item.label)).toEqual(['Order.Table.al:3', 'Order.Table.al:3']);
        // The folder is what tells two such files apart, relative to the workspace.
        expect(offered.map(item => item.description).sort()).toEqual(['app/src/Copy/Order.Table.al', 'app/src/Order.Table.al']);
        expect(shownSelection(ORDER).path).toBe(`/w/${offered[1].description}`);
    });

    it('does nothing more when the choice is cancelled', async () => {
        setVirtualFile(`${APP}/src/Copy/Order.Table.al`, ORDER);
        setQuickPickResult(undefined);

        const outcome = await goToSource(request(CAPTION), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.cancelled);
        expect(flushShownDocuments()).toEqual([]);
        expect(flushExecutedCommands()).toEqual([]);
        expect(flushInfoMessages()).toEqual([]);
    });
});

describe('goToSource, when no AL source declares the unit', () => {
    it('shows the unit in the base file, and says why in a notice that closes itself', async () => {
        const outcome = await goToSource(request(UNDECLARED), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.baseFile);
        expect(flushExecutedCommands()).toEqual([{ command: 'vscode.openWith', args: [expect.objectContaining({ scheme: 'file', path: BASE }), 'default'] }]);
        const notices = flushProgress().filter(record => record.location === vscode.ProgressLocation.Notification);
        expect(notices.map(record => record.title)).toEqual(['The AL source for this unit was not found, so it is shown in Contoso.g.xlf instead.']);
        expect(flushInfoMessages()).toEqual([]);
    });

    it('goes to the base file for a unit whose id carries no AL structure at all', async () => {
        setVirtualFile(BASE, baseFile('1'));

        expect(await goToSource(request('1'), alSources, baseFiles)).toBe(SourceOutcome.baseFile);
    });

    it('goes to the base file when the translation file belongs to no app and no workspace', async () => {
        setWorkspaceRoot(undefined);
        removeVirtualFile(`${APP}/app.json`);

        expect(await goToSource(request(CAPTION), alSources, baseFiles)).toBe(SourceOutcome.baseFile);
        expect(flushShownDocuments()).toEqual([]);
    });

    it('says so when there is no base file either', async () => {
        removeVirtualFile(BASE);

        const outcome = await goToSource(request(UNDECLARED), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.nowhere);
        expect(flushInfoMessages()).toEqual(['The AL source for this unit was not found, and no base file was found for this translation file.']);
        expect(flushExecutedCommands()).toEqual([]);
    });

    it('names the unit when the base file does not carry it', async () => {
        const orphan = `Table ${h('Contoso Removed')} - Property ${h('Caption')}`;

        const outcome = await goToSource(request(orphan), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.nowhere);
        expect(flushInfoMessages()).toEqual([`The AL source for this unit was not found, and the base file does not contain "${orphan}". It may have been removed since this translation was made.`]);
    });

    it('shows a base file\'s unit in the base file itself', async () => {
        const outcome = await goToSource(request(UNDECLARED, { document: vscode.Uri.file(BASE), isBaseFile: true }), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.ownFile);
        expect(flushExecutedCommands()).toEqual([{ command: 'vscode.openWith', args: [expect.objectContaining({ scheme: 'file', path: BASE }), 'default'] }]);
        expect(flushProgress().map(record => record.title)).toContain('The AL source for this unit was not found, so it is shown in this file instead.');
    });

    it('still opens a base file\'s unit in its AL source when there is one', async () => {
        const outcome = await goToSource(request(CAPTION, { document: vscode.Uri.file(BASE), isBaseFile: true }), alSources, baseFiles);

        expect(outcome).toBe(SourceOutcome.declaration);
        expect(shownSelection(ORDER).path).toBe(ORDER_FILE);
    });
});

describe('showTransientNotice', () => {
    it('is a notification that closes on its own after five seconds', async () => {
        showTransientNotice('Shown in the base file instead.');
        const [notice] = flushProgress();

        expect(notice).toMatchObject({ location: vscode.ProgressLocation.Notification, title: 'Shown in the base file instead.', done: false });
        await vi.advanceTimersByTimeAsync(4999);
        expect(notice.done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(notice.done).toBe(true);
    });
});

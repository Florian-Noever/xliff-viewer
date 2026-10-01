import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { unitTarget } from '../../extension/al/alTarget';
import { AlListingPath, listAlFiles } from '../../extension/services/alFileListing';
import { goToSource, SourceOutcome } from '../../extension/services/goToSource';
import { alScopeFor } from '../../extension/services/alScope';
import { AlSourceIndex, AlSourceIndexes } from '../../extension/services/alSourceIndex';
import { Logger } from '../../extension/services/logger';
import { alNameHash } from '../../extension/xliff/alNameHash';
import {
    fireFileWatcher,
    flushFileReads,
    flushLogs,
    flushProgress,
    flushProgressTitles,
    removeVirtualFile,
    resetMocks,
    setOpenDocument,
    setSearchAvailable,
    setVirtualFile,
    setWorkspaceRoot,
    watcherCount,
} from '../__mocks__/vscode';

import type { UnitTarget } from '../../extension/al/alTarget';

const h = alNameHash;
const uri = (path: string): vscode.Uri => vscode.Uri.file(path);
const APP = '/w/app';
const TABLE = 'table 50100 "Contoso Order" { Caption = \'Contoso Order\'; }';
const CAPTION = `Table ${h('Contoso Order')} - Property ${h('Caption')}`;

function target(id: string): UnitTarget {
    const read = unitTarget(id);
    if (read === undefined) {
        throw new Error(`${id} carries no AL structure.`);
    }
    return read;
}

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
    setWorkspaceRoot('/w');
});

afterEach(() => {
    vi.restoreAllMocks();
    resetMocks();
});

describe('alScopeFor', () => {
    it('finds the app a translation file belongs to, and its preprocessor symbols', async () => {
        setVirtualFile(`${APP}/app.json`, JSON.stringify({ name: 'Contoso', preprocessorSymbols: ['CLEAN', 7] }));
        setVirtualFile(`${APP}/Translations/Contoso.de-DE.xlf`, '<xliff/>');

        const scope = await alScopeFor(uri(`${APP}/Translations/Contoso.de-DE.xlf`));

        expect(scope?.folder.path).toBe(APP);
        expect(scope?.symbols).toEqual(['CLEAN']);
    });

    it('takes the workspace folder when no app.json lies above the file', async () => {
        setVirtualFile('/w/loose/Contoso.de-DE.xlf', '<xliff/>');

        const scope = await alScopeFor(uri('/w/loose/Contoso.de-DE.xlf'));

        expect(scope?.folder.path).toBe('/w');
        expect(scope?.symbols).toEqual([]);
    });

    it('does not look above the workspace folder', async () => {
        setWorkspaceRoot('/a/w');
        setVirtualFile('/a/app.json', '{}');
        setVirtualFile('/a/w/Translations/Contoso.de-DE.xlf', '<xliff/>');

        expect((await alScopeFor(uri('/a/w/Translations/Contoso.de-DE.xlf')))?.folder.path).toBe('/a/w');
    });

    it('finds an app.json further up when the file is in no workspace folder', async () => {
        setWorkspaceRoot(undefined);
        setVirtualFile('/a/app.json', '{}');
        setVirtualFile('/a/w/Translations/Contoso.de-DE.xlf', '<xliff/>');

        expect((await alScopeFor(uri('/a/w/Translations/Contoso.de-DE.xlf')))?.folder.path).toBe('/a');
    });

    it('takes a linked app.json for one, since a file type is a set of bits', async () => {
        setVirtualFile(`${APP}/app.json`, JSON.stringify({ preprocessorSymbols: ['CLEAN'] }));
        const stat = vscode.workspace.fs.stat;
        vi.spyOn(vscode.workspace.fs, 'stat').mockImplementation(async (asked: vscode.Uri) => {
            const answer = await stat(asked);
            return asked.path.endsWith('app.json') ? { ...answer, type: vscode.FileType.File | vscode.FileType.SymbolicLink } : answer;
        });

        const scope = await alScopeFor(uri(`${APP}/Translations/Contoso.de-DE.xlf`));

        expect(scope?.folder.path).toBe(APP);
        expect(scope?.symbols).toEqual(['CLEAN']);
    });

    it('leaves the translation file\'s query out of every probe', async () => {
        // For a diff, the query is what names the file; every app.json probed beside it would
        // otherwise answer for the translation file itself.
        const probed: string[] = [];
        const stat = vscode.workspace.fs.stat;
        vi.spyOn(vscode.workspace.fs, 'stat').mockImplementation((asked: vscode.Uri) => {
            probed.push(asked.query);
            return stat(asked);
        });

        await alScopeFor(uri(`${APP}/Translations/Contoso.de-DE.xlf`).with({ query: '{"ref":"HEAD"}' }));

        expect(probed.length).toBeGreaterThan(0);
        expect(probed.every(query => query === '')).toBe(true);
    });

    it('reads a broken app.json as having no symbols, and says so', async () => {
        setVirtualFile(`${APP}/app.json`, '{ not json');

        expect((await alScopeFor(uri(`${APP}/Translations/x.xlf`)))?.symbols).toEqual([]);
        expect(flushLogs().some(line => line.startsWith('warn') && line.includes('app.json'))).toBe(true);
    });
});

describe('listAlFiles', () => {
    beforeEach(() => {
        setVirtualFile(`${APP}/src/Order.Table.al`, TABLE);
        setVirtualFile(`${APP}/src/sub/Card.Page.al`, 'page 1 Card { }');
        setVirtualFile(`${APP}/.snapshots/Order.Table.al`, TABLE);
        setVirtualFile(`${APP}/.alpackages/Dependency.al`, TABLE);
        setVirtualFile(`${APP}/node_modules/x/Stray.al`, TABLE);
        setVirtualFile(`${APP}/.vscode/Settings.al`, TABLE);
        setVirtualFile(`${APP}/src/.hidden/Draft.al`, TABLE);
        setVirtualFile(`${APP}/README.md`, '');
    });

    it('searches, and leaves out dependencies and every hidden folder', async () => {
        const listing = await listAlFiles(uri(APP));

        expect(listing.via).toBe(AlListingPath.search);
        expect(listing.files.map(file => file.path).sort()).toEqual([`${APP}/src/Order.Table.al`, `${APP}/src/sub/Card.Page.al`]);
    });

    it('lists a root that itself sits inside a hidden folder, by search and by walking', async () => {
        setVirtualFile('/x/.work/app/src/Inside.al', TABLE);

        expect((await listAlFiles(uri('/x/.work/app'))).files.map(file => file.path)).toEqual(['/x/.work/app/src/Inside.al']);
        setSearchAvailable(false);
        expect((await listAlFiles(uri('/x/.work/app'))).files.map(file => file.path)).toEqual(['/x/.work/app/src/Inside.al']);
    });

    it('walks the folder when the host\'s search finds nothing, and leaves out the same', async () => {
        setSearchAvailable(false);

        const listing = await listAlFiles(uri(APP));

        expect(listing.via).toBe(AlListingPath.walk);
        expect(listing.files.map(file => file.path).sort()).toEqual([`${APP}/src/Order.Table.al`, `${APP}/src/sub/Card.Page.al`]);
        expect(flushLogs().some(line => line.includes('by walking the folder'))).toBe(true);
    });
});

describe('AlSourceIndex', () => {
    let index: AlSourceIndex;

    beforeEach(() => {
        setVirtualFile(`${APP}/src/Order.Table.al`, TABLE);
        setVirtualFile(`${APP}/src/Card.Page.al`, 'page 50101 "Contoso Card" { Caption = \'Card\'; }');
        index = new AlSourceIndex({ folder: uri(APP), symbols: [] });
    });

    afterEach(() => {
        index.dispose();
    });

    it('is built on first use, with progress, and not before', async () => {
        expect(flushFileReads()).toEqual([]);

        const objects = await index.objects();

        expect(objects.map(object => object.name).sort()).toEqual(['Contoso Card', 'Contoso Order']);
        expect(flushProgressTitles()).toEqual(['Indexing AL objects…']);
    });

    it('builds once for two callers asking at the same time', async () => {
        await Promise.all([index.objects(), index.objects()]);

        expect(flushFileReads().filter(path => path.endsWith('Order.Table.al'))).toHaveLength(1);
    });

    it('locates a unit, and hands back the document it was read from', async () => {
        const outcome = await index.locate(target(CAPTION));

        expect(outcome.result.kind).toBe('found');
        if (outcome.result.kind === 'found') {
            const document = outcome.documents.get(outcome.result.location.file);
            expect(document?.getText().slice(outcome.result.location.range.start, outcome.result.location.range.end)).toBe('Caption');
        }
    });

    it('reads a changed file again, and only that one', async () => {
        await index.objects();
        flushFileReads();
        setVirtualFile(`${APP}/src/Order.Table.al`, TABLE.replace('Contoso Order', 'Contoso Renamed'));
        fireFileWatcher('changed', `${APP}/src/Order.Table.al`);

        const objects = await index.objects();

        expect(objects.map(object => object.name)).toContain('Contoso Renamed');
        expect(flushFileReads().filter(path => path.endsWith('.al'))).toEqual([`${APP}/src/Order.Table.al`]);
    });

    it('lists the files again when one comes or goes, and says so', async () => {
        let announced = 0;
        index.onDidChangeFiles(() => announced++);
        await index.objects();

        setVirtualFile(`${APP}/src/New.Codeunit.al`, 'codeunit 50102 "Contoso New" { }');
        fireFileWatcher('created', `${APP}/src/New.Codeunit.al`);
        removeVirtualFile(`${APP}/src/Card.Page.al`);
        fireFileWatcher('deleted', `${APP}/src/Card.Page.al`);

        expect((await index.objects()).map(object => object.name).sort()).toEqual(['Contoso New', 'Contoso Order']);
        expect(announced).toBe(2);
    });

    it('refreshes once on a miss, finding a file no watcher reported', async () => {
        await index.objects();
        setVirtualFile(`${APP}/src/Late.Table.al`, 'table 50103 "Contoso Late" { Caption = \'Late\'; }');

        const outcome = await index.locate(target(`Table ${h('Contoso Late')} - Property ${h('Caption')}`));

        expect(outcome.result.kind).toBe('found');
    });

    it('reads an open document\'s text, not the file\'s', async () => {
        setOpenDocument(`${APP}/src/Order.Table.al`, 'table 50100 "Contoso Order" { ToolTip = \'Tip\'; }');

        const outcome = await index.locate(target(`Table ${h('Contoso Order')} - Property ${h('ToolTip')}`));

        expect(outcome.result.kind).toBe('found');
    });

    it('does not list an app with no AL file again on every miss', async () => {
        for (const path of [`${APP}/src/Order.Table.al`, `${APP}/src/Card.Page.al`]) {
            removeVirtualFile(path);
        }
        const findFiles = vi.spyOn(vscode.workspace, 'findFiles');

        await index.locate(target(CAPTION));
        await index.locate(target(CAPTION));

        expect(findFiles).toHaveBeenCalledTimes(1);
    });

    it('does not read a file it could not read again on every build', async () => {
        const readFile = vscode.workspace.fs.readFile;
        vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation((asked: vscode.Uri) => (asked.path.endsWith('Card.Page.al') ? Promise.reject(new Error('locked')) : readFile(asked)));

        await index.objects();
        await index.objects();

        expect(flushProgressTitles()).toEqual(['Indexing AL objects…']);
        expect(flushLogs().filter(line => line.includes('Could not read'))).toHaveLength(1);
    });

    it('reads again a file a watcher dropped while the others were being read', async () => {
        await index.objects();
        flushProgress();
        setVirtualFile(`${APP}/src/New.Codeunit.al`, 'codeunit 50102 "Contoso New" { }');
        fireFileWatcher('created', `${APP}/src/New.Codeunit.al`);
        const readFile = vscode.workspace.fs.readFile;
        vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation((asked: vscode.Uri) => {
            if (asked.path.endsWith('New.Codeunit.al')) {
                // Saved while the new file is read: its entry goes, and its object must not.
                fireFileWatcher('changed', `${APP}/src/Order.Table.al`);
            }
            return readFile(asked);
        });

        const objects = await index.objects();

        expect(objects.map(object => object.name).sort()).toEqual(['Contoso Card', 'Contoso New', 'Contoso Order']);
        expect(flushProgress()).toHaveLength(1);
    });

    it('lets its watcher go when disposed', () => {
        const before = watcherCount();
        index.dispose();

        expect(watcherCount()).toBe(before - 1);
    });
});

describe('AlSourceIndexes', () => {
    const GERMAN = uri(`${APP}/Translations/a.de-DE.xlf`);
    const FRENCH = uri(`${APP}/Translations/a.fr-FR.xlf`);
    const BASE_FILE = uri(`${APP}/Translations/Contoso.g.xlf`);

    let indexes: AlSourceIndexes;

    beforeEach(() => {
        setVirtualFile(`${APP}/app.json`, '{}');
        indexes = new AlSourceIndexes();
    });

    afterEach(() => {
        indexes.dispose();
    });

    it('shares one index, and one watcher, between the translation files of one app', async () => {
        const watching = watcherCount();

        const first = await indexes.acquire(GERMAN);
        const second = await indexes.acquire(FRENCH);

        expect(first?.index).toBeDefined();
        expect(second?.index).toBe(first?.index);
        expect(watcherCount()).toBe(watching + 1);
    });

    it('disposes the index, and its watcher, once the last lease is released', async () => {
        const watching = watcherCount();
        const first = await indexes.acquire(GERMAN);
        const second = await indexes.acquire(FRENCH);

        first?.release();
        expect(watcherCount()).toBe(watching + 1);
        second?.release();
        expect(watcherCount()).toBe(watching);

        expect((await indexes.acquire(GERMAN))?.index).not.toBe(first?.index);
    });

    it('counts a lease released twice only once', async () => {
        const watching = watcherCount();
        const first = await indexes.acquire(GERMAN);
        const second = await indexes.acquire(FRENCH);

        first?.release();
        first?.release();

        expect(watcherCount()).toBe(watching + 1);
        second?.release();
        expect(watcherCount()).toBe(watching);
    });

    it('keeps an index that a panel holds alive through a click', async () => {
        setVirtualFile(`${APP}/src/Order.Table.al`, TABLE);
        setVirtualFile(BASE_FILE.path, `<xliff><trans-unit id="${CAPTION}"/></xliff>`);
        const held = await indexes.acquire(GERMAN);
        const watching = watcherCount();

        expect(await goToSource({ document: BASE_FILE, isBaseFile: true, unitId: CAPTION }, indexes, undefined)).toBe(SourceOutcome.declaration);

        expect(watcherCount()).toBe(watching);
        expect((await indexes.acquire(FRENCH))?.index).toBe(held?.index);
    });

    it('lets go of an index that only a click acquired', async () => {
        setVirtualFile(`${APP}/src/Order.Table.al`, TABLE);
        setVirtualFile(BASE_FILE.path, `<xliff><trans-unit id="${CAPTION}"/></xliff>`);
        const watching = watcherCount();

        expect(await goToSource({ document: BASE_FILE, isBaseFile: true, unitId: CAPTION }, indexes, undefined)).toBe(SourceOutcome.declaration);

        expect(watcherCount()).toBe(watching);
    });

    it('takes changed preprocessor symbols from the next click on', async () => {
        setVirtualFile(`${APP}/app.json`, JSON.stringify({ preprocessorSymbols: ['A'] }));
        setVirtualFile(`${APP}/src/Order.Table.al`, '#if B\ntable 50100 "Contoso Order" { Caption = \'Contoso Order\'; }\n#endif\n');
        setVirtualFile(BASE_FILE.path, `<xliff><trans-unit id="${CAPTION}"/></xliff>`);
        // Held as an open panel holds it, so both clicks ask the same index.
        await indexes.acquire(GERMAN);
        const request = { document: BASE_FILE, isBaseFile: true, unitId: CAPTION };

        expect(await goToSource(request, indexes, undefined)).toBe(SourceOutcome.ownFile);
        setVirtualFile(`${APP}/app.json`, JSON.stringify({ preprocessorSymbols: ['B'] }));
        expect(await goToSource(request, indexes, undefined)).toBe(SourceOutcome.declaration);
    });

    it('has none for a file outside any workspace folder and any app', async () => {
        setWorkspaceRoot(undefined);

        expect(await indexes.acquire(uri('/elsewhere/a.xlf'))).toBeUndefined();
    });

    it('hands out nothing once disposed, and builds nothing to hand out', async () => {
        const watching = watcherCount();
        indexes.dispose();

        expect(await indexes.acquire(GERMAN)).toBeUndefined();
        expect(watcherCount()).toBe(watching);
    });
});

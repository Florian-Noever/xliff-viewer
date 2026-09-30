import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { unitTarget } from '../../extension/al/alTarget';
import { AlListingPath, listAlFiles } from '../../extension/services/alFileListing';
import { alScopeFor } from '../../extension/services/alScope';
import { AlSourceIndex, AlSourceIndexes } from '../../extension/services/alSourceIndex';
import { Logger } from '../../extension/services/logger';
import { alNameHash } from '../../extension/xliff/alNameHash';
import {
    fireFileWatcher,
    flushFileReads,
    flushLogs,
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
        setVirtualFile('/app.json', '{}');
        setVirtualFile('/w/Translations/Contoso.de-DE.xlf', '<xliff/>');

        expect((await alScopeFor(uri('/w/Translations/Contoso.de-DE.xlf')))?.folder.path).toBe('/w');
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
        setVirtualFile(`${APP}/README.md`, '');
    });

    it('searches, and leaves out snapshots, dependencies and tooling', async () => {
        const listing = await listAlFiles(uri(APP));

        expect(listing.via).toBe(AlListingPath.search);
        expect(listing.files.map(file => file.path).sort()).toEqual([`${APP}/src/Order.Table.al`, `${APP}/src/sub/Card.Page.al`]);
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

    it('lets its watcher go when disposed', () => {
        const before = watcherCount();
        index.dispose();

        expect(watcherCount()).toBe(before - 1);
    });
});

describe('AlSourceIndexes', () => {
    it('shares one index between the translation files of one app', async () => {
        setVirtualFile(`${APP}/app.json`, '{}');
        const indexes = new AlSourceIndexes();

        const first = await indexes.forFile(uri(`${APP}/Translations/a.de-DE.xlf`));
        const second = await indexes.forFile(uri(`${APP}/Translations/a.fr-FR.xlf`));

        expect(first).toBeDefined();
        expect(second).toBe(first);
        indexes.dispose();
    });

    it('has none for a file outside any workspace folder and any app', async () => {
        setWorkspaceRoot(undefined);
        const indexes = new AlSourceIndexes();

        expect(await indexes.forFile(uri('/elsewhere/a.xlf'))).toBeUndefined();
        indexes.dispose();
    });
});

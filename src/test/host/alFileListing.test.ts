import * as vscode from 'vscode';
import { beforeEach, describe, expect, it } from 'vitest';

import { AlListingPath, listAlFiles } from '../../extension/services/alFileListing';
import { flushLogs, setSearchAvailable, setVirtualFile, setWorkspaceRoot } from '../__mocks__/vscode';

const uri = (path: string): vscode.Uri => vscode.Uri.file(path);
const APP = '/w/app';
const TABLE = 'table 50100 "Contoso Order" { Caption = \'Contoso Order\'; }';

beforeEach(() => {
    setWorkspaceRoot('/w');
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

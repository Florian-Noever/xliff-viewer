import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alScopeFor } from '../../extension/services/alScope';
import { flushLogs, setVirtualFile, setWorkspaceRoot } from '../__mocks__/vscode';

const uri = (path: string): vscode.Uri => vscode.Uri.file(path);
const APP = '/w/app';

beforeEach(() => {
    setWorkspaceRoot('/w');
});

afterEach(() => {
    vi.restoreAllMocks();
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

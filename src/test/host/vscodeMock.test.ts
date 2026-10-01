import { afterEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';

import { FakeTextDocument, flushAppliedEdits, flushErrorMessages, flushFileReads, holdFileRead, reportEditsInPieces, resetMocks, setApplyEditResult, setConfigOverride, setUserConfigOverride, setVirtualFile, setWorkspaceTrusted } from '../__mocks__/vscode';

afterEach(() => {
    resetMocks();
});

/** Smoke test for the mock itself: the host tests build on every helper below. */
describe('vscode mock', () => {
    it('resolves the aliased module rather than the real extension host', () => {
        expect(typeof vscode.workspace.getConfiguration).toBe('function');
        expect(vscode.Uri.file('/a/b').path).toBe('/a/b');
    });

    it('joins Uris without touching the filesystem', () => {
        const joined = vscode.Uri.joinPath(vscode.Uri.file('/root'), 'Translations', 'App.g.xlf');
        expect(joined.path).toBe('/root/Translations/App.g.xlf');
    });

    it('serves virtual files and records the reads', async () => {
        setVirtualFile('/ws/App.g.xlf', '<xliff/>');
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file('/ws/App.g.xlf'));
        expect(new TextDecoder().decode(bytes)).toBe('<xliff/>');
        expect(flushFileReads()).toEqual(['/ws/App.g.xlf']);
    });

    it('holds a read until released, answering with the file as it was when asked', async () => {
        setVirtualFile('/ws/App.g.xlf', 'before');
        const release = holdFileRead('/ws/App.g.xlf');
        let answer: string | undefined;
        const reading = vscode.workspace.fs.readFile(vscode.Uri.file('/ws/App.g.xlf')).then((bytes) => {
            answer = new TextDecoder().decode(bytes);
        });

        setVirtualFile('/ws/App.g.xlf', 'after');
        await Promise.resolve();
        expect(answer).toBeUndefined();

        release();
        await reading;
        expect(answer).toBe('before');
    });

    it('rejects a missing file', async () => {
        await expect(vscode.workspace.fs.readFile(vscode.Uri.file('/nope'))).rejects.toThrow('ENOENT');
    });

    it('matches globs in findFiles', async () => {
        setVirtualFile('/ws/Translations/App.g.xlf', '');
        setVirtualFile('/ws/Translations/App.de-DE.xlf', '');
        const found = await vscode.workspace.findFiles('/ws/**/*.g.xlf');
        expect(found.map(u => u.path)).toEqual(['/ws/Translations/App.g.xlf']);
    });

    it('returns configuration overrides and falls back to the default', () => {
        setConfigOverride('xliffViewer.baseFile', 'Translations/App.g.xlf');
        const config = vscode.workspace.getConfiguration('xliffViewer');
        expect(config.get('baseFile', '')).toBe('Translations/App.g.xlf');
        expect(config.get('editMode', false)).toBe(false);
    });

    it('tells user values from workspace values, and trust from Restricted Mode', () => {
        setConfigOverride('section.key', 'workspace');
        setUserConfigOverride('section.key', 'user');
        let granted = 0;
        const listening = vscode.workspace.onDidGrantWorkspaceTrust(() => {
            granted++;
        });

        expect(vscode.workspace.getConfiguration('section').inspect('key')).toEqual({ key: 'section.key', globalValue: 'user', workspaceValue: 'workspace' });
        expect(vscode.workspace.getConfiguration('section').get('key')).toBe('workspace');
        expect(vscode.workspace.isTrusted).toBe(true);
        setWorkspaceTrusted(false);
        expect(vscode.workspace.isTrusted).toBe(false);
        setWorkspaceTrusted(true);
        listening.dispose();
        setWorkspaceTrusted(false);
        setWorkspaceTrusted(true);
        expect(granted).toBe(1);
    });

    it('records shown error messages', async () => {
        await vscode.window.showErrorMessage('parse failed');
        expect(flushErrorMessages()).toEqual(['parse failed']);
    });

    it('records applied workspace edits', async () => {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(vscode.Uri.file('/ws/a.xlf'), new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 5)), 'neu');
        await vscode.workspace.applyEdit(edit);

        const applied = flushAppliedEdits();
        expect(applied).toHaveLength(1);
        expect(applied[0].newText).toBe('neu');
        expect(applied[0].uri).toContain('/ws/a.xlf');
    });

    it('answers applyEdit as told: applied, refused or rejected', async () => {
        const edit = new vscode.WorkspaceEdit();
        expect(await vscode.workspace.applyEdit(edit)).toBe(true);

        setApplyEditResult(false);
        expect(await vscode.workspace.applyEdit(edit)).toBe(false);

        setApplyEditResult(new Error('gone'));
        await expect(vscode.workspace.applyEdit(edit)).rejects.toThrow('gone');
    });

    it('writes an edit with the document\'s line ending, and can report it in pieces', () => {
        const document = new FakeTextDocument('/ws/a.xlf', 'one\r\ntwo');
        const reported: unknown[] = [];
        const listening = vscode.workspace.onDidChangeTextDocument((event) => {
            reported.push(event.contentChanges);
        });

        document.applyEdit(new vscode.Range(new vscode.Position(0, 3), new vscode.Position(0, 3)), '\nhalf');
        reportEditsInPieces(true);
        document.applyEdit(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 3)), 'ONE');
        listening.dispose();

        expect(document.getText()).toBe('ONE\r\nhalf\r\ntwo');
        expect(reported).toEqual([
            [{ rangeOffset: 3, rangeLength: 0, text: '\r\nhalf' }],
            [{ rangeOffset: 0, rangeLength: 3, text: '' }, { rangeOffset: 0, rangeLength: 0, text: 'ONE' }],
        ]);
    });

    it('fires events through EventEmitter', () => {
        const emitter = new vscode.EventEmitter<string>();
        const seen: string[] = [];
        const subscription = emitter.event(value => seen.push(value));
        emitter.fire('one');
        subscription.dispose();
        emitter.fire('two');
        expect(seen).toEqual(['one']);
    });
});

import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';

import {
    customEditorRegistrations,
    emitterListenerCount,
    FakeTextDocument,
    fireFileWatcher,
    flushAppliedEdits,
    flushConfigurationScopes,
    flushErrorMessages,
    flushFileReads,
    holdFileRead,
    reportEditsInPieces,
    resetMocks,
    setApplyEditResult,
    setConfigOverride,
    setOpenDocument,
    setSearchAvailable,
    setUserConfigOverride,
    setVirtualFile,
    setWorkspaceRoot,
    setWorkspaceTrusted,
    watcherCount,
} from '../__mocks__/vscode';

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

    it('joins Uris as VS Code does', () => {
        expect(vscode.Uri.joinPath(vscode.Uri.file('/'), 'app.json').path).toBe('/app.json');
        expect(vscode.Uri.joinPath(vscode.Uri.file('/w/'), 'x').path).toBe('/w/x');
        expect(vscode.Uri.joinPath(vscode.Uri.file('/w/a/b'), '..', './c', 'd/../e').path).toBe('/w/a/c/e');
    });

    it('keeps the query and fragment of the base it joins to', () => {
        const base = vscode.Uri.file('/w/App.xlf').with({ query: 'ref=HEAD', fragment: 'top' });
        const joined = vscode.Uri.joinPath(base, '..', 'app.json');

        expect([joined.path, joined.query, joined.fragment]).toEqual(['/w/app.json', 'ref=HEAD', 'top']);
    });

    it('round-trips a path with a space through toString and parse', () => {
        const uri = vscode.Uri.file('/w/Contoso App.de-DE.xlf');

        expect(uri.toString()).toBe('file:///w/Contoso%20App.de-DE.xlf');
        expect(vscode.Uri.parse(uri.toString()).path).toBe('/w/Contoso App.de-DE.xlf');
    });

    it('reads a Windows path the same on every platform', () => {
        expect(vscode.Uri.file('C:\\w\\App.xlf').path).toBe('/C:/w/App.xlf');
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

    it('reads a string glob in findFiles from the workspace folder, as VS Code does', async () => {
        setVirtualFile('/ws/Translations/App.g.xlf', '');
        setVirtualFile('/ws/Translations/App.de-DE.xlf', '');
        setWorkspaceRoot('/ws');

        expect((await vscode.workspace.findFiles('**/*.g.xlf')).map(u => u.path)).toEqual(['/ws/Translations/App.g.xlf']);
        expect((await vscode.workspace.findFiles('Translations/*.g.xlf')).map(u => u.path)).toEqual(['/ws/Translations/App.g.xlf']);
        expect(await vscode.workspace.findFiles('/ws/**/*.g.xlf')).toEqual([]);

        setWorkspaceRoot(undefined);
        expect(await vscode.workspace.findFiles('**/*.g.xlf')).toEqual([]);
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
        expect(emitterListenerCount()).toBe(1);
        subscription.dispose();
        emitter.fire('two');
        expect(seen).toEqual(['one']);
        expect(emitterListenerCount()).toBe(0);
    });

    it('reads a setting only by its qualified key, as the editor does', () => {
        setConfigOverride('baseFile', 'Translations/App.g.xlf');

        expect(vscode.workspace.getConfiguration('xliffViewer').get('baseFile', '')).toBe('');
    });

    it('positions an offset by line and character and back, a CR counting as part of its line', async () => {
        const text = 'a\nbc\r\nd';
        const document = new FakeTextDocument('/ws/lines.xlf', text);
        const atD = document.positionAt(text.indexOf('d'));

        expect(atD).toEqual(new vscode.Position(2, 0));
        expect(document.offsetAt(atD)).toBe(text.indexOf('d'));
        expect(document.positionAt(text.indexOf('c'))).toEqual(new vscode.Position(1, 1));
        expect(document.positionAt(-5)).toEqual(new vscode.Position(0, 0));
        expect(document.positionAt(text.length + 5)).toEqual(document.positionAt(text.length));

        setVirtualFile('/ws/lines.xlf', text);
        expect((await vscode.workspace.openTextDocument(vscode.Uri.file('/ws/lines.xlf'))).positionAt(text.indexOf('d'))).toEqual(atD);
    });

    it('lists a folder\'s files, and the folders below it that hold more', async () => {
        setVirtualFile('/ws/app.json', '{}');
        setVirtualFile('/ws/src/Order.Table.al', '');
        setVirtualFile('/ws/src/deep/Line.Table.al', '');

        expect(await vscode.workspace.fs.readDirectory(vscode.Uri.file('/ws'))).toEqual([['app.json', vscode.FileType.File], ['src', vscode.FileType.Directory]]);
        expect(await vscode.workspace.fs.readDirectory(vscode.Uri.file('/ws/src/'))).toEqual([['Order.Table.al', vscode.FileType.File], ['deep', vscode.FileType.Directory]]);
        await expect(vscode.workspace.fs.readDirectory(vscode.Uri.file('/ws/none'))).rejects.toThrow('ENOENT');
    });

    it('tells a file from a folder, and moves a file\'s modification time on with each write', async () => {
        setVirtualFile('/ws/src/Order.Table.al', 'a');
        const first = await vscode.workspace.fs.stat(vscode.Uri.file('/ws/src/Order.Table.al'));
        setVirtualFile('/ws/src/Order.Table.al', 'b');
        const second = await vscode.workspace.fs.stat(vscode.Uri.file('/ws/src/Order.Table.al'));

        expect(first.type).toBe(vscode.FileType.File);
        expect(second.mtime).toBeGreaterThan(first.mtime);
        expect((await vscode.workspace.fs.stat(vscode.Uri.file('/ws/src'))).type).toBe(vscode.FileType.Directory);
        await expect(vscode.workspace.fs.stat(vscode.Uri.file('/ws/nothing'))).rejects.toThrow('ENOENT');
    });

    it('matches globs relative to a folder, one character to a ?, and up to a limit', async () => {
        setVirtualFile('/ws/app/src/Order.Table.al', '');
        setVirtualFile('/ws/app/src/Line.Table.al', '');
        setVirtualFile('/ws/other/src/Order.Table.al', '');
        setWorkspaceRoot('/ws');

        const relative = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file('/ws/app'), '**/*.al'));

        expect(relative.map(uri => uri.path)).toEqual(['/ws/app/src/Order.Table.al', '/ws/app/src/Line.Table.al']);
        expect((await vscode.workspace.findFiles('**/????.Table.al')).map(uri => uri.path)).toEqual(['/ws/app/src/Line.Table.al']);
        expect(await vscode.workspace.findFiles('**/*.al', undefined, 1)).toHaveLength(1);
    });

    it('matches brace alternatives and character classes, as VS Code\'s globs do', async () => {
        setVirtualFile('/ws/Translations/App.g.xlf', '');
        setVirtualFile('/ws/i18n/Other.g.xlf', '');
        setVirtualFile('/ws/docs/Notes.g.xlf', '');
        setWorkspaceRoot('/ws');

        expect((await vscode.workspace.findFiles('**/{Translations,i18n}/*.g.xlf')).map(uri => uri.path)).toEqual(['/ws/Translations/App.g.xlf', '/ws/i18n/Other.g.xlf']);
        expect((await vscode.workspace.findFiles('**/[A-N]*.g.xlf')).map(uri => uri.path)).toEqual(['/ws/Translations/App.g.xlf', '/ws/docs/Notes.g.xlf']);
    });

    it('finds nothing when search is off, as in a host without a search provider', async () => {
        setVirtualFile('/ws/T/App.g.xlf', '');
        setWorkspaceRoot('/ws');
        setSearchAvailable(false);

        expect(await vscode.workspace.findFiles('**/*.g.xlf')).toEqual([]);
    });

    it('fires a watcher only for paths its pattern selects, plain or relative to a folder', () => {
        const seen: string[] = [];
        vscode.workspace.createFileSystemWatcher('**/*.g.xlf').onDidChange(uri => seen.push(`plain ${uri.path}`));
        vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file('/ws/app'), '**/*.al'))
            .onDidCreate(uri => seen.push(`relative ${uri.path}`));

        fireFileWatcher('changed', '/ws/T/App.g.xlf');
        fireFileWatcher('changed', '/ws/T/App.de-DE.xlf');
        fireFileWatcher('created', '/ws/app/src/Order.Table.al');
        fireFileWatcher('created', '/ws/other/src/Order.Table.al');

        expect(seen).toEqual(['plain /ws/T/App.g.xlf', 'relative /ws/app/src/Order.Table.al']);
    });

    it('takes every path with backslashes as it takes it with slashes', async () => {
        setVirtualFile('\\ws\\a.xlf', 'text');
        const seen: string[] = [];
        vscode.workspace.createFileSystemWatcher('**/*.xlf').onDidChange(uri => seen.push(uri.path));
        const release = holdFileRead('\\ws\\a.xlf');
        let read: string | undefined;
        const reading = vscode.workspace.fs.readFile(vscode.Uri.file('/ws/a.xlf')).then((bytes) => {
            read = new TextDecoder().decode(bytes);
        });

        fireFileWatcher('changed', '\\ws\\a.xlf');
        await Promise.resolve();
        expect(read).toBeUndefined();
        release();
        await reading;

        expect(read).toBe('text');
        expect(seen).toEqual(['/ws/a.xlf']);
    });

    it('records a read as it is attempted, whether or not the file is there', async () => {
        await expect(vscode.workspace.openTextDocument(vscode.Uri.file('/ws/none.xlf'))).rejects.toThrow('ENOENT');
        await expect(vscode.workspace.fs.readFile(vscode.Uri.file('/ws/gone.xlf'))).rejects.toThrow('ENOENT');

        expect(flushFileReads()).toEqual(['/ws/none.xlf', '/ws/gone.xlf']);
    });

    it('keeps one registry of open documents, whose buffers win over the disk', async () => {
        setVirtualFile('/ws/open.xlf', 'on disk');
        const made = new FakeTextDocument('/ws/open.xlf', 'in the editor');
        const opened = setOpenDocument('/ws/other.xlf', 'one');

        expect(vscode.workspace.textDocuments).toEqual([made, opened]);
        expect(await vscode.workspace.openTextDocument(vscode.Uri.file('/ws/open.xlf'))).toBe(made);

        const edit = new vscode.WorkspaceEdit();
        edit.replace(opened.uri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 3)), 'two');
        await vscode.workspace.applyEdit(edit);
        expect((await vscode.workspace.openTextDocument(opened.uri)).getText()).toBe('two');
    });

    it('records the scope each settings read asked for', () => {
        const document = vscode.Uri.file('/ws/App.de-DE.xlf');

        vscode.workspace.getConfiguration('xliffViewer', document);
        vscode.workspace.getConfiguration('xliffSync');

        expect(flushConfigurationScopes()).toEqual([{ section: 'xliffViewer', scope: document }, { section: 'xliffSync', scope: undefined }]);
    });

    it('forgets the editors and the registered editor provider on reset', () => {
        const editorOn = (path: string) => ({ document: new FakeTextDocument(path, '') }) as unknown as vscode.TextEditor;
        vscode.window.registerCustomEditorProvider('xliff-viewer.editor', {} as vscode.CustomTextEditorProvider);
        vscode.window.activeTextEditor = editorOn('/ws/a.xlf');
        vscode.window.visibleTextEditors = [editorOn('/ws/b.xlf')];

        resetMocks();

        expect(customEditorRegistrations).toEqual([]);
        expect(vscode.window.activeTextEditor).toBeUndefined();
        expect(vscode.window.visibleTextEditors).toEqual([]);
    });

    it('stops a watcher once disposed, and counts the ones still live', () => {
        const seen: string[] = [];
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.g.xlf');
        watcher.onDidDelete(uri => seen.push(uri.path));
        expect(watcherCount()).toBe(1);

        watcher.dispose();
        fireFileWatcher('deleted', '/ws/T/App.g.xlf');

        expect(watcherCount()).toBe(0);
        expect(seen).toEqual([]);
    });
});

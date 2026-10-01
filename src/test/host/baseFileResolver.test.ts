import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BaseFileResolver, BaseFileSource } from '../../extension/services/baseFileResolver';
import { appNameOf, fileNameOf } from '../../extension/services/uriNames';
import {
    configurationListenerCount,
    fireConfigurationChange,
    flushLogs,
    removeVirtualFile,
    setConfigOverride,
    setUserConfigOverride,
    setVirtualFile,
    setWorkspaceRoot,
    setWorkspaceTrusted,
    watcherCount,
} from '../__mocks__/vscode';

/** XLIFF Sync declares a base-file setting; NAB AL Tools declares none, so it has no tests here. */

const WORKSPACE = '/w';
const uri = (path: string): vscode.Uri => vscode.Uri.file(path);

function workspaceWith(...paths: string[]): void {
    setWorkspaceRoot(WORKSPACE);
    for (const path of paths) {
        setVirtualFile(path, '<xliff/>');
    }
}

let resolver: BaseFileResolver;

beforeEach(() => {
    resolver = new BaseFileResolver();
});

afterEach(() => {
    resolver.dispose();
});

describe('appNameOf', () => {
    it('strips the language segment', () => {
        expect(appNameOf(uri('/w/Contoso Base App.de-DE.xlf'))).toBe('Contoso Base App');
    });

    it('keeps a stem that has no language segment', () => {
        expect(appNameOf(uri('/w/App.xlf'))).toBe('App');
    });

    it('keeps the dots inside an app name', () => {
        expect(appNameOf(uri('/w/Contoso.Sales.App.de-DE.xlf'))).toBe('Contoso.Sales.App');
    });

    it('takes the file name off a URI, whatever the folder is called', () => {
        expect(fileNameOf(uri('/w/Translations/Contoso Base App.de-DE.xlf'))).toBe('Contoso Base App.de-DE.xlf');
        expect(fileNameOf(uri('/App.g.xlf'))).toBe('App.g.xlf');
    });
});

describe('the conventions', () => {
    it('finds the sibling .g.xlf', async () => {
        workspaceWith('/w/Translations/App.de-DE.xlf', '/w/Translations/App.g.xlf');

        const found = await resolver.resolve(uri('/w/Translations/App.de-DE.xlf'), false);

        expect(found.uri?.path).toBe('/w/Translations/App.g.xlf');
        expect(found.source).toBe(BaseFileSource.sibling);
    });

    it('falls back to any .g.xlf in the same folder when the names do not line up', async () => {
        workspaceWith('/w/Translations/App.de-DE.xlf', '/w/Translations/Something Else.g.xlf');

        const found = await resolver.resolve(uri('/w/Translations/App.de-DE.xlf'), false);

        expect(found.uri?.path).toBe('/w/Translations/Something Else.g.xlf');
        expect(found.source).toBe(BaseFileSource.folder);
    });

    it('prefers the sibling over another .g.xlf beside it', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/Another.g.xlf', '/w/T/App.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).source).toBe(BaseFileSource.sibling);
    });

    it('looks under a Translations folder elsewhere in the workspace', async () => {
        workspaceWith('/w/loose/App.de-DE.xlf', '/w/app/Translations/App.g.xlf');

        const found = await resolver.resolve(uri('/w/loose/App.de-DE.xlf'), false);

        expect(found.uri?.path).toBe('/w/app/Translations/App.g.xlf');
        expect(found.source).toBe(BaseFileSource.translations);
    });

    it('picks the base file named after this app when several apps share the workspace', async () => {
        // Taking the first hit would pair the translation with another app's base file,
        // which marks every unit orphaned — a confidently wrong answer.
        workspaceWith(
            '/w/loose/App.de-DE.xlf',
            '/w/other/Translations/Other.g.xlf',
            '/w/app/Translations/App.g.xlf',
            '/w/third/Translations/Third.g.xlf',
        );

        const found = await resolver.resolve(uri('/w/loose/App.de-DE.xlf'), false);

        expect(found.uri?.path).toBe('/w/app/Translations/App.g.xlf');
    });

    it('says which one it guessed when no candidate carries the app name', async () => {
        workspaceWith('/w/loose/App.de-DE.xlf', '/w/other/Translations/Other.g.xlf', '/w/third/Translations/Third.g.xlf');

        const found = await resolver.resolve(uri('/w/loose/App.de-DE.xlf'), false);

        expect(found.source).toBe(BaseFileSource.translations);
        expect(flushLogs().some(line => line.includes('none is named "app.g.xlf"'))).toBe(true);
    });

    it('reports nothing, not an error, when the workspace has no base file', async () => {
        workspaceWith('/w/T/App.de-DE.xlf');

        const found = await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false);

        expect(found.uri).toBeUndefined();
        expect(found.source).toBeUndefined();
        expect(flushLogs().some(line => line.startsWith('error'))).toBe(false);
    });

    it('does not look for a base file for a base file', async () => {
        workspaceWith('/w/T/App.g.xlf', '/w/T/Other.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.g.xlf'), true)).uri).toBeUndefined();
    });
});

describe('our own setting', () => {
    it('overrides the sibling', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf', '/w/elsewhere/Chosen.g.xlf');
        setConfigOverride('xliffViewer.baseFile', '/w/elsewhere/Chosen.g.xlf');

        const found = await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false);

        expect(found.uri?.path).toBe('/w/elsewhere/Chosen.g.xlf');
        expect(found.source).toBe(BaseFileSource.setting);
    });

    it('accepts a workspace-relative path', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/other/Base.g.xlf');
        setConfigOverride('xliffViewer.baseFile', 'other/Base.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).uri?.path).toBe('/w/other/Base.g.xlf');
    });

    it('accepts a glob', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/deep/nest/Base.g.xlf');
        setConfigOverride('xliffViewer.baseFile', '**/nest/*.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).uri?.path).toBe('/w/deep/nest/Base.g.xlf');
    });

    it('falls through to the conventions when the configured path is not there', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        setConfigOverride('xliffViewer.baseFile', '/w/gone/Missing.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).source).toBe(BaseFileSource.sibling);
    });
});

describe('XLIFF Sync', () => {
    it('uses its setting when it names a real file', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf', '/w/T/Sync Chose This.g.xlf');
        setConfigOverride('xliffSync.baseFile', 'Sync Chose This.g.xlf');

        const found = await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false);

        expect(found.uri?.path).toBe('/w/T/Sync Chose This.g.xlf');
        expect(found.source).toBe(BaseFileSource.xliffSync);
    });

    it('reads its default, which is a suffix rather than a path', async () => {
        // Its declared default is ".g.xlf"; treating that as a filename would find nothing.
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/Only Base.g.xlf');
        setConfigOverride('xliffSync.baseFile', '.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).uri?.path).toBe('/w/T/Only Base.g.xlf');
    });

    it('loses to our own setting', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/Ours.g.xlf', '/w/T/Theirs.g.xlf');
        setConfigOverride('xliffViewer.baseFile', '/w/T/Ours.g.xlf');
        setConfigOverride('xliffSync.baseFile', 'Theirs.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).source).toBe(BaseFileSource.setting);
    });

    it('ignores a value of the wrong type without throwing', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        setConfigOverride('xliffSync.baseFile', { unexpected: true });

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).source).toBe(BaseFileSource.sibling);
    });

    it('treats an empty value as not configured', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        setConfigOverride('xliffSync.baseFile', '   ');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).source).toBe(BaseFileSource.sibling);
    });

    it('falls through when its value names nothing that exists', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        setConfigOverride('xliffSync.baseFile', 'NotHere.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).source).toBe(BaseFileSource.sibling);
    });

    describe('in Restricted Mode', () => {
        beforeEach(() => {
            workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf', '/w/T/Workspace Chose This.g.xlf', '/w/T/User Chose This.g.xlf');
            setWorkspaceTrusted(false);
        });

        it('ignores the workspace\'s value', async () => {
            setConfigOverride('xliffSync.baseFile', 'Workspace Chose This.g.xlf');

            expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).source).toBe(BaseFileSource.sibling);
        });

        it('uses the user\'s own value', async () => {
            setConfigOverride('xliffSync.baseFile', 'Workspace Chose This.g.xlf');
            setUserConfigOverride('xliffSync.baseFile', 'User Chose This.g.xlf');

            expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).uri?.path).toBe('/w/T/User Chose This.g.xlf');
        });

        it('starts over once the workspace is trusted', async () => {
            setConfigOverride('xliffSync.baseFile', 'Workspace Chose This.g.xlf');
            await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false);

            setWorkspaceTrusted(true);

            expect((await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false)).uri?.path).toBe('/w/T/Workspace Chose This.g.xlf');
        });
    });
});

describe('caching and invalidation', () => {
    it('answers from cache rather than searching twice', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        const document = uri('/w/T/App.de-DE.xlf');

        await resolver.resolve(document, false);
        flushLogs();
        await resolver.resolve(document, false);

        expect(flushLogs().filter(line => line.includes('Base file for'))).toHaveLength(0);
    });

    it('starts over once invalidated, as a .g.xlf coming or going does', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        const document = uri('/w/T/App.de-DE.xlf');
        expect((await resolver.resolve(document, false)).uri).toBeDefined();

        removeVirtualFile('/w/T/App.g.xlf');
        resolver.invalidate();

        expect((await resolver.resolve(document, false)).uri).toBeUndefined();
    });

    it('starts over when configuration changes', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf', '/w/T/Other.g.xlf');
        const document = uri('/w/T/App.de-DE.xlf');
        expect((await resolver.resolve(document, false)).source).toBe(BaseFileSource.sibling);

        setConfigOverride('xliffViewer.baseFile', '/w/T/Other.g.xlf');
        fireConfigurationChange('xliffViewer.baseFile');

        expect((await resolver.resolve(document, false)).source).toBe(BaseFileSource.setting);
    });

    it('ignores a configuration change in a section that is none of its business', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf', '/w/T/Other.g.xlf');
        const document = uri('/w/T/App.de-DE.xlf');
        await resolver.resolve(document, false);

        setConfigOverride('xliffViewer.baseFile', '/w/T/Other.g.xlf');
        fireConfigurationChange('editor.fontSize');

        expect((await resolver.resolve(document, false)).source).toBe(BaseFileSource.sibling);
    });

    it('watches no files itself, and stops listening once disposed', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false);
        const configuring = configurationListenerCount();

        resolver.dispose();

        expect(watcherCount()).toBe(0);
        expect(configurationListenerCount()).toBe(configuring - 1);
    });
});

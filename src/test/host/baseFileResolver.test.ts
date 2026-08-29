import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BaseFileResolver, BaseFileSource } from '../../extension/services/baseFileResolver';
import { appNameOf, fileNameOf } from '../../extension/services/uriNames';
import { Logger } from '../../extension/services/logger';
import {
    fireConfigurationChange,
    fireFileWatcher,
    flushLogs,
    removeVirtualFile,
    resetMocks,
    setConfigOverride,
    setVirtualFile,
    setWorkspaceRoot,
} from '../__mocks__/vscode';

/**
 * §9.2's six steps. The third-party ones were verified against the published manifests
 * rather than guessed (`DEC-031`), and what that turned up shapes these tests: XLIFF Sync
 * has a key, NAB AL Tools has none.
 */

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
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
    resolver = new BaseFileResolver();
});

afterEach(() => {
    resolver.dispose();
    resetMocks();
});

describe('appNameOf', () => {
    it('strips the language segment', () => {
        expect(appNameOf(uri('/w/Contoso App.de-DE.xlf'))).toBe('Contoso App');
    });

    it('keeps a stem that has no language segment', () => {
        expect(appNameOf(uri('/w/App.xlf'))).toBe('App');
    });

    it('keeps the dots inside an app name', () => {
        expect(appNameOf(uri('/w/Contoso.Sales.App.de-DE.xlf'))).toBe('Contoso.Sales.App');
    });

    it('takes the file name off a URI, whatever the folder is called', () => {
        expect(fileNameOf(uri('/w/Translations/Contoso App.de-DE.xlf'))).toBe('Contoso App.de-DE.xlf');
        expect(fileNameOf(uri('/App.g.xlf'))).toBe('App.g.xlf');
    });
});

describe('the conventions (§9.2 steps 4–6)', () => {
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
        // REVIEW-02a: taking the first hit here paired a translation with another app's
        // base file, which marks every unit orphaned (§9.3) — a confidently wrong answer.
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

    it('does not look for a base file for a base file (§9.2)', async () => {
        workspaceWith('/w/T/App.g.xlf', '/w/T/Other.g.xlf');

        expect((await resolver.resolve(uri('/w/T/App.g.xlf'), true)).uri).toBeUndefined();
    });
});

describe('our own setting (§9.2 step 1)', () => {
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

describe('XLIFF Sync (§9.2 step 2)', () => {
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
});

describe('caching and invalidation (§9.4)', () => {
    it('answers from cache rather than searching twice', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        const document = uri('/w/T/App.de-DE.xlf');

        await resolver.resolve(document, false);
        flushLogs();
        await resolver.resolve(document, false);

        expect(flushLogs().filter(line => line.includes('Base file for'))).toHaveLength(0);
    });

    it('starts over when a .g.xlf is deleted', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        const document = uri('/w/T/App.de-DE.xlf');
        expect((await resolver.resolve(document, false)).uri).toBeDefined();

        removeVirtualFile('/w/T/App.g.xlf');
        fireFileWatcher('deleted', '/w/T/App.g.xlf');

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

    it('stops listening once disposed', async () => {
        workspaceWith('/w/T/App.de-DE.xlf', '/w/T/App.g.xlf');
        await resolver.resolve(uri('/w/T/App.de-DE.xlf'), false);

        expect(() => {
            resolver.dispose();
            fireFileWatcher('deleted', '/w/T/App.g.xlf');
        }).not.toThrow();
    });
});

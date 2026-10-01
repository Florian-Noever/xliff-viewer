import * as vscode from 'vscode';

import { unitTarget } from '../../extension/al/alTarget';
import { listAlFiles, walkAlFiles } from '../../extension/services/alFileListing';
import { alScopeFor } from '../../extension/services/alScope';
import { AlSourceIndex, AlSourceIndexes } from '../../extension/services/alSourceIndex';
import { BaseFileResolver } from '../../extension/services/baseFileResolver';
import { goToSource, SourceOutcome } from '../../extension/services/goToSource';
import { findUnitOffset } from '../../extension/services/navigation';
import { appUnits, translationRoot } from '../fixtures/alApp';
import { renderApp } from '../fixtures/alRender';
import { AL_APPS, CONTOSO_MANIFEST, contosoApp, fabrikamApp, FIXTURE, NORTHWIND_MANIFEST } from '../fixtures/corpus';
import { NORTHWIND } from '../fixtures/northwind';
import { assertEqual, assertOk } from './assertions';

import type { SourceRequest } from '../../extension/services/goToSource';
import type { AlApp, AppUnit } from '../fixtures/alApp';
import type { AppManifest } from '../fixtures/alRender';

/**
 * AL source, found and read by the host's own file system.
 *
 * Listing files and reading them is exactly where the web host differs from the desktop one
 * — its file system may have no search provider at all — so this runs in both, against the
 * AL sources committed under `src/test/fixtures/al/`.
 */

function workspaceUri(...segments: string[]): vscode.Uri {
    const folders = vscode.workspace.workspaceFolders;
    assertOk(folders && folders.length > 0, 'no workspace folder is open');
    return vscode.Uri.joinPath(folders[0].uri, ...segments);
}

const AL = ['src', 'test', 'fixtures', 'al'];
const XLIFF = ['src', 'test', 'fixtures', 'xliff'];
const alFilesOf = (app: AlApp, manifest: AppManifest) => renderApp(app, manifest).files.filter(file => file.path.endsWith('.al'));

/** Locates a unit in its app's committed source and checks the place against the rendering. */
async function assertLocated(folderName: string, app: AlApp, manifest: AppManifest, unit: AppUnit): Promise<void> {
    const rendered = renderApp(app, manifest);
    const index = new AlSourceIndex({ folder: workspaceUri(...AL, folderName), symbols: rendered.symbols });
    try {
        const target = unitTarget(unit.id, unit.generatorNote, unit.alObjectTarget);
        assertOk(target, `${unit.id} carries no AL structure`);
        const outcome = await index.locate(target);
        const expected = rendered.expected.get(unit.id);

        assertOk(outcome.result.kind === 'found', `${unit.id} was ${outcome.result.kind}`);
        assertOk(expected, `no expected location for ${unit.id}`);
        assertOk(decodeURIComponent(outcome.result.location.file).endsWith(expected.file), `${unit.id} was found in ${outcome.result.location.file}`);
        assertEqual(outcome.result.location.range.start, expected.offset, `${unit.id} was found at the wrong place`);
    } finally {
        index.dispose();
    }
}

function requestFor(fileName: string, unit: AppUnit): SourceRequest {
    return {
        document: workspaceUri(...XLIFF, fileName),
        isBaseFile: false,
        unitId: unit.id,
        generatorNote: unit.generatorNote,
        alObjectTarget: unit.alObjectTarget,
    };
}

function editorFor(uri: vscode.Uri): vscode.TextEditor | undefined {
    const wanted = uri.toString();
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === wanted);
}

async function closeEverything(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

suite('AL source, in whichever host this is', () => {
    test('lists every committed AL file, by search or by walking', async () => {
        const listing = await listAlFiles(workspaceUri(...AL));
        const expected = alFilesOf(contosoApp(), CONTOSO_MANIFEST).length + alFilesOf(NORTHWIND, NORTHWIND_MANIFEST).length;

        assertEqual(listing.files.length, expected, `the listing by ${listing.via} found the wrong number of files`);
    });

    test('walking the folder finds exactly what searching it does', async () => {
        // Both hosts here can search, so the walk — what a host without search depends on —
        // is only ever run by asking for it.
        const searched = (await listAlFiles(workspaceUri(...AL))).files.map(uri => uri.toString()).sort();
        const walked = (await walkAlFiles(workspaceUri(...AL))).map(uri => uri.toString()).sort();

        assertEqual(walked.length, searched.length, 'the walk found a different number of files');
        assertEqual(walked.join(' | '), searched.join(' | '), 'the walk and the search found different files');
    });

    test('finds the app a file belongs to, with its preprocessor symbols', async () => {
        const scope = await alScopeFor(workspaceUri(...AL, AL_APPS.contoso, 'src', 'ContosoSetup.Table.al'));

        assertOk(scope, 'no scope for a file inside an app');
        assertOk(decodeURIComponent(scope.folder.path).endsWith(`/${AL_APPS.contoso}`), `scoped to ${scope.folder.path}`);
        assertEqual(scope.symbols.join(','), 'CLEAN', 'read the wrong preprocessor symbols');
    });

    test('locates a unit where its source declares it', async () => {
        const [unit] = appUnits(contosoApp());
        await assertLocated(AL_APPS.contoso, contosoApp(), CONTOSO_MANIFEST, unit);
    });

    test('locates a unit the compiler files under another object than the one that declares it', async () => {
        const folded = appUnits(NORTHWIND).find(unit => translationRoot(NORTHWIND, unit.declaring) !== unit.declaring);
        assertOk(folded, 'the namespaced app has no folded unit');
        await assertLocated(AL_APPS.namespaced, NORTHWIND, NORTHWIND_MANIFEST, folded);
    });

    test('Go to source opens the declaring token, found from the translation file', async () => {
        const [unit] = appUnits(contosoApp());
        const expected = renderApp(contosoApp(), CONTOSO_MANIFEST).expected.get(unit.id);
        assertOk(expected, `no expected location for ${unit.id}`);
        const alSources = new AlSourceIndexes();
        const baseFiles = new BaseFileResolver();
        try {
            const outcome = await goToSource(requestFor(FIXTURE.german, unit), alSources, baseFiles);
            const editor = vscode.window.activeTextEditor;

            assertEqual(outcome, SourceOutcome.declaration, `${unit.id} was not opened in its AL source`);
            assertOk(editor, 'no editor is active');
            assertOk(decodeURIComponent(editor.document.uri.path).endsWith(expected.file), `opened ${editor.document.uri.path}`);
            assertEqual(editor.document.offsetAt(editor.selection.start), expected.offset, 'the selection is not on the declaring token');
        } finally {
            alSources.dispose();
            baseFiles.dispose();
            await closeEverything();
        }
    });

    test('Go to source shows the unit in the base file when there is no AL source to ask', async () => {
        const [unit] = appUnits(contosoApp());
        const baseFiles = new BaseFileResolver();
        try {
            const outcome = await goToSource(requestFor(FIXTURE.german, unit), undefined, baseFiles);
            const editor = editorFor(workspaceUri(...XLIFF, FIXTURE.base));

            assertEqual(outcome, SourceOutcome.baseFile, `${unit.id} was not shown in the base file`);
            assertOk(editor, 'the base file did not open as text');
            const offset = findUnitOffset(editor.document.getText(), unit.id);
            assertOk(offset !== undefined, `${unit.id} is not in the base file`);
            assertEqual(editor.selection.active.line, editor.document.positionAt(offset).line, 'the cursor is not on the unit');
        } finally {
            baseFiles.dispose();
            await closeEverything();
        }
    });

    test('Go to source looks for a unit no AL source declares, and answers without opening anything', async () => {
        // The app's AL is not in the workspace, and no base file in its folder carries it.
        const [unit] = appUnits(fabrikamApp());
        const alSources = new AlSourceIndexes();
        const baseFiles = new BaseFileResolver();
        try {
            assertEqual(await goToSource(requestFor(FIXTURE.large, unit), alSources, baseFiles), SourceOutcome.nowhere, `${unit.id} was found somewhere`);
        } finally {
            alSources.dispose();
            baseFiles.dispose();
            await closeEverything();
        }
    });
});

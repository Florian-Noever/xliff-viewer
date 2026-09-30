import * as vscode from 'vscode';

import { unitTarget } from '../../extension/al/alTarget';
import { listAlFiles } from '../../extension/services/alFileListing';
import { alScopeFor } from '../../extension/services/alScope';
import { AlSourceIndex } from '../../extension/services/alSourceIndex';
import { appUnits, translationRoot } from '../fixtures/alApp';
import { renderApp } from '../fixtures/alRender';
import { AL_APPS, CONTOSO_MANIFEST, contosoApp, NORTHWIND_MANIFEST } from '../fixtures/corpus';
import { NORTHWIND } from '../fixtures/northwind';

import { assertEqual, assertOk } from './assertions';

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

suite('AL source, in whichever host this is', () => {
    test('lists every committed AL file, by search or by walking', async () => {
        const listing = await listAlFiles(workspaceUri(...AL));
        const expected = alFilesOf(contosoApp(), CONTOSO_MANIFEST).length + alFilesOf(NORTHWIND, NORTHWIND_MANIFEST).length;

        assertEqual(listing.files.length, expected, `the listing by ${listing.via} found the wrong number of files`);
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
});

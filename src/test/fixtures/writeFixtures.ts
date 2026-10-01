/**
 * Writes the generated fixtures over the committed ones. Only `src/test/setup/fixtures.ts`
 * calls these, once and before any test runs: a test compares, it never writes.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { generateAlSources, generateCorpus } from './corpus';
import { generateDevDocuments } from './devFixture';

import type { FixtureFile } from './corpus';

const XLIFF_FOLDER = fileURLToPath(new URL('./xliff', import.meta.url));
const AL_FOLDER = fileURLToPath(new URL('./al', import.meta.url));
const DEV_DOCUMENT_FOLDER = fileURLToPath(new URL('../../webview/fixtures', import.meta.url));

function writeFiles(folder: string, files: readonly FixtureFile[]): void {
    for (const file of files) {
        const path = join(folder, file.name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, file.text, 'utf8');
    }
}

/** The XLIFF corpus, and the AL source of its apps. */
export function writeCorpus(): void {
    writeFiles(XLIFF_FOLDER, generateCorpus());
    // Rewritten whole, so a file the generator no longer writes does not linger.
    rmSync(AL_FOLDER, { recursive: true, force: true });
    writeFiles(AL_FOLDER, generateAlSources());
}

/** The documents the Vite dev server renders. */
export function writeDevDocuments(): void {
    writeFiles(DEV_DOCUMENT_FOLDER, generateDevDocuments());
}

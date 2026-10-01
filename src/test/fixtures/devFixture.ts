/**
 * The documents the Vite dev server renders: which slice of the fixture corpus they show,
 * and how they are built from it.
 *
 * `devFixture.test.ts` holds the committed documents in `src/webview/fixtures/` to what this
 * builds, so the dev server always shows what the extension would send for those files.
 */

import { FIXTURE, generateCorpus } from './corpus';
import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { splitUnitId } from '../../shared/unitPath';

import type { FixtureFile } from './corpus';
import type { XliffDocumentDto } from '../../shared/dto';

export const DEV_FIXTURE_SOURCE = FIXTURE.large;

/** The namespaced sample, shown whole when the dev server's URL asks for `?namespaced`. */
export const DEV_NAMESPACED_SOURCE = FIXTURE.namespacedGerman;

/**
 * Five root objects, chosen for what they cover rather than for being first:
 *
 * - `Codeunit 562451849` — carries a `maxwidth`, and many units under one object.
 * - `Table 1518856175` and `Page 1518856175` — the **same hash under two object types**,
 *   so the tree has to keep them apart on screen as well as in the model.
 * - `PageExtension 465446794` — four segments deep, and mixes translated with empty.
 * - `PageExtension 3965510573` — mixed states, with `al-object-target` present.
 *
 * Between them: translated and empty units, an empty source, both tree depths, and every
 * optional trans-unit attribute AL emits.
 */
export const DEV_FIXTURE_ROOTS: readonly string[] = [
    'Codeunit 562451849',
    'Table 1518856175',
    'Page 1518856175',
    'PageExtension 465446794',
    'PageExtension 3965510573',
];

/** True for a unit the fixture includes. */
export function isDevFixtureUnit(id: string): boolean {
    return DEV_FIXTURE_ROOTS.includes(splitUnitId(id)[0]);
}

/** Generated once: the whole corpus is megabytes of text, and both documents come from it. */
let corpus: readonly FixtureFile[] | undefined;

function corpusFile(name: string): string {
    corpus ??= generateCorpus();
    const source = corpus.find(file => file.name === name);
    if (source === undefined) {
        throw new Error(`The corpus has no ${name}.`);
    }
    return source.text;
}

/**
 * The dev document: the source file, keeping only the units under the chosen roots.
 *
 * Reads the generator's output rather than the committed file — the same bytes, which
 * `corpus.test.ts` holds the file to — so regenerating both in one run cannot read a stale
 * file.
 */
export function buildDevDocument(): XliffDocumentDto {
    const model = parseXliff(corpusFile(DEV_FIXTURE_SOURCE));
    const trimmed = {
        ...model,
        files: model.files.map(file => ({
            ...file,
            body: {
                ...file.body,
                units: file.body.units.filter(unit => isDevFixtureUnit(unit.id)),
                groups: file.body.groups.map(group => ({
                    ...group,
                    units: group.units.filter(unit => isDevFixtureUnit(unit.id)),
                })),
            },
        })),
    };
    return projectDocument(trimmed, {
        uri: `file:///workspace/Translations/${DEV_FIXTURE_SOURCE}`,
        fileName: DEV_FIXTURE_SOURCE,
    });
}

/** The namespaced sample, whole: it is small, and every unit in it shows something. */
export function buildDevNamespacedDocument(): XliffDocumentDto {
    return projectDocument(parseXliff(corpusFile(DEV_NAMESPACED_SOURCE)), {
        uri: `file:///workspace/Translations/${DEV_NAMESPACED_SOURCE}`,
        fileName: DEV_NAMESPACED_SOURCE,
    });
}

/** A generated dev-server module: its header, byte for byte, then the document. */
function devModule(what: readonly string[], constant: string, document: XliffDocumentDto): string {
    return [
        '/* eslint-disable -- generated file; see the note below */',
        '/**',
        ...what.map(line => (line === '' ? ' *' : ` * ${line}`)),
        ' * `src/test/data/devFixture.test.ts` rebuilds it from that file and fails if this one has',
        ' * drifted, so the dev server always shows what the extension would send.',
        ' *',
        ' * Tree-shaken out of the production bundle: it is reached only under',
        ' * `import.meta.env.DEV`, which Vite replaces with `false` when building.',
        ' */',
        '',
        "import type { XliffDocumentDto } from '../../shared/dto';",
        '',
        `export const ${constant}: XliffDocumentDto = ${JSON.stringify(document, null, 4)};`,
        '',
    ].join('\n');
}

/** Both dev-server modules, named as they are in `src/webview/fixtures/`. */
export function generateDevDocuments(): readonly FixtureFile[] {
    return [
        {
            name: 'devDocument.ts',
            text: devModule([
                'The document the Vite dev server renders when there is no extension host.',
                '',
                '**Generated — do not hand-edit.** It is a projection of the fixture file named by',
                '`DEV_FIXTURE_SOURCE`, trimmed to the root objects listed in `src/test/fixtures/devFixture.ts`.',
            ], 'DEV_DOCUMENT', buildDevDocument()),
        },
        {
            name: 'devNamespacedDocument.ts',
            text: devModule([
                'The namespaced document the Vite dev server renders when its URL asks for `?namespaced`.',
                '',
                '**Generated — do not hand-edit.** It is the projection of the fixture file named by',
                '`DEV_NAMESPACED_SOURCE` in `src/test/fixtures/devFixture.ts`, whole.',
            ], 'DEV_NAMESPACED_DOCUMENT', buildDevNamespacedDocument()),
        },
    ];
}

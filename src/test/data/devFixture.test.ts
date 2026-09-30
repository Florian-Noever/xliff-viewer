import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { DEV_FIXTURE_ROOTS, DEV_FIXTURE_SOURCE, DEV_NAMESPACED_SOURCE, isDevFixtureUnit } from '../../shared/devFixture';
import { DEV_DOCUMENT } from '../../webview/fixtures/devDocument';
import { DEV_NAMESPACED_DOCUMENT } from '../../webview/fixtures/devNamespacedDocument';
import { XliffState } from '../../shared/state';
import { generateCorpus } from '../fixtures/corpus';

import type { XliffDocumentDto } from '../../shared/dto';

const fixture = (name: string): string => fileURLToPath(new URL(`../../webview/fixtures/${name}`, import.meta.url));

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

/** Generated once: the whole corpus is megabytes of text, and both documents come from it. */
let corpus: ReturnType<typeof generateCorpus> | undefined;

function corpusFile(name: string): string {
    corpus ??= generateCorpus();
    const source = corpus.find(file => file.name === name);
    if (source === undefined) {
        throw new Error(`The corpus has no ${name}.`);
    }
    return source.text;
}

/**
 * Rebuilds the fixture from the corpus, keeping only the units it selects.
 *
 * Reads the generator's output rather than the committed file — the same bytes, which
 * `corpus.test.ts` holds the file to — so regenerating both in one run cannot read a stale
 * file.
 */
function rebuild(): XliffDocumentDto {
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

const updating = process.env.UPDATE_FIXTURES === '1';

/** The namespaced sample, whole: it is small, and every unit in it shows something. */
function rebuildNamespaced(): XliffDocumentDto {
    return projectDocument(parseXliff(corpusFile(DEV_NAMESPACED_SOURCE)), {
        uri: `file:///workspace/Translations/${DEV_NAMESPACED_SOURCE}`,
        fileName: DEV_NAMESPACED_SOURCE,
    });
}

if (updating) {
    writeFileSync(fixture('devDocument.ts'), devModule([
        'The document the Vite dev server renders when there is no extension host.',
        '',
        '**Generated — do not hand-edit.** It is a projection of the fixture file named by',
        '`DEV_FIXTURE_SOURCE`, trimmed to the root objects listed in `src/shared/devFixture.ts`.',
    ], 'DEV_DOCUMENT', rebuild()), 'utf8');
    writeFileSync(fixture('devNamespacedDocument.ts'), devModule([
        'The namespaced document the Vite dev server renders when its URL asks for `?namespaced`.',
        '',
        '**Generated — do not hand-edit.** It is the projection of the fixture file named by',
        '`DEV_NAMESPACED_SOURCE` in `src/shared/devFixture.ts`, whole.',
    ], 'DEV_NAMESPACED_DOCUMENT', rebuildNamespaced()), 'utf8');
}

describe('the dev-server fixture', () => {
    // Skipped while rewriting: the module under test was loaded before the rewrite.
    it.skipIf(updating)('is exactly what the corpus produces, not invented data', () => {
        // Without this the fixture decays: someone tweaks it to make a screenshot look
        // right and the dev server stops showing what the extension actually sends.
        expect(DEV_DOCUMENT).toEqual(rebuild());
    });

    it.skipIf(updating)('has a namespaced sibling that is exactly what the corpus produces', () => {
        expect(DEV_NAMESPACED_DOCUMENT).toEqual(rebuildNamespaced());
        expect(DEV_NAMESPACED_DOCUMENT.files[0].namespaced).toBe(true);
    });

    it('carries every root it claims to, one object-type level down', () => {
        const roots = DEV_DOCUMENT.files[0].tree.flatMap(group => group.children).map(node => node.key);
        expect(roots.sort()).toEqual([...DEV_FIXTURE_ROOTS].sort());
    });

    it('groups those roots by their object type, and says how many', () => {
        const groups = DEV_DOCUMENT.files[0].tree;

        expect(groups.every(group => group.group === true)).toBe(true);
        expect(groups.reduce((sum, group) => sum + group.children.length, 0)).toBe(DEV_FIXTURE_ROOTS.length);
        expect(groups.map(group => group.name)).toEqual(groups.map(group => `${group.type}s (${group.children.length})`));
        expect(groups.map(group => group.name)).toContain('Codeunits (1)');
    });

    it('covers what UI work needs to see', () => {
        const units = DEV_DOCUMENT.files[0].units;

        expect(units.length).toBeGreaterThan(50);
        expect(units.some(unit => unit.maxwidth !== undefined)).toBe(true);
        expect(units.some(unit => unit.alObjectTarget !== undefined)).toBe(true);
        expect(units.some(unit => unit.developerHint !== undefined)).toBe(true);
        expect(new Set(units.map(unit => unit.state))).toEqual(new Set([XliffState.translated, XliffState.empty]));
    });

    it('keeps the two objects that share a hash apart', () => {
        // Table 1518856175 and Page 1518856175 are the same name under two object types:
        // the case the tree must not merge, visible on the dev server.
        const shared = DEV_DOCUMENT.files[0].tree
            .flatMap(group => group.children)
            .filter(node => node.key.endsWith(' 1518856175'));

        expect(shared).toHaveLength(2);
        expect(shared.map(node => node.type).sort()).toEqual(['Page', 'Table']);
        expect(shared[0].name).toBeDefined();
        expect(shared[1].name).toBe(shared[0].name);
    });

    it('is four levels deep somewhere, so nesting is visible', () => {
        interface Nested { readonly children: readonly Nested[] }
        const depth = (nodes: readonly Nested[], level = 0): number =>
            nodes.length === 0 ? level : Math.max(...nodes.map((node: Nested) => depth(node.children, level + 1)));

        // Five with the object-type level above them.
        expect(depth(DEV_DOCUMENT.files[0].tree)).toBe(5);
    });

    it('stays small enough to live in the repository', () => {
        expect(JSON.stringify(DEV_DOCUMENT).length).toBeLessThan(64 * 1024);
    });
});

import { describe, expect, it } from 'vitest';

import { indexedObjects } from '../../extension/al/alHeaderIndex';
import { outlineAl, scanHeaders } from '../../extension/al/alOutline';
import { unitTarget } from '../../extension/al/alTarget';
import { candidateObjects, locateUnit } from '../../extension/al/unitLocator';
import { XliffDocumentSession } from '../../extension/editor/documentSession';
import { XliffDocumentView } from '../../extension/editor/documentView';
import { buildAlTree, groupRoots } from '../../extension/xliff/alTree';
import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { serialiseXliff } from '../../extension/xliff/serialise';
import { validateXml } from '../../extension/xliff/validate';
import { visibleNodes } from '../../webview/ancestorFilter';
import { buildSearchIndex, toMatcher } from '../../webview/composables/useSearch';
import { expandableKeys, flattenTree, keysToDepth } from '../../webview/composables/useTreeFlatten';
import { hintsFor } from '../../webview/validation';
import { whitespaceParts } from '../../webview/whitespace';
import { iterateUnits } from '../../shared/model';
import { effectiveState, summariseTree } from '../../shared/state';
import { FakeTextDocument } from '../__mocks__/vscode';
import { renderApp } from '../fixtures/alRender';
import { fabrikamApp, FABRIKAM_MANIFEST, generateNamespacedFabrikam } from '../fixtures/corpus';
import { generatorNote } from '../../extension/xliff/names';
import { FIXTURE, readFixture } from '../support/fixtures';

import type * as vscode from 'vscode';
import type { AlOutline } from '../../extension/al/alOutline';
import type { XliffDocumentDto } from '../../shared/dto';
import type { UnitState } from '../../shared/state';

/**
 * Every wall-clock budget, in one file.
 *
 * They live apart from the tests of the same code for one reason: they are the only
 * assertions in the suite whose result depends on what else the machine is doing, and a
 * timing assertion that fails because another project is busy is not an assertion. The
 * `perf` project runs them one file at a time, after everything else.
 */

/** Each budget in milliseconds, named for the work it bounds, and read by its title and its assertion. */
const BUDGET_MS = {
    validate: 60,
    parse: 100,
    serialise: 60,
    tree: 60,
    namespacedTree: 60,
    rollUp: 40,
    hints: 40,
    dto: 50,
    keystroke: 50,
    firstScreen: 100,
    searchIndex: 100,
    edit: 100,
    ready: 250,
    alHeaders: 100,
    locate: 20,
    whitespace: 5,
} as const;

const LARGE = FIXTURE.large;
const text = readFixture(LARGE);

/** Best of several: the fastest run is the one least disturbed by everything else. */
function fastest(attempts: number, run: () => void): number {
    run(); // warm up, so this measures the work and not the JIT
    let best = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const started = performance.now();
        run();
        best = Math.min(best, performance.now() - started);
    }
    return best;
}

describe('performance budgets on the large example file', () => {
    it(`validates in under ${BUDGET_MS.validate} ms`, () => {
        expect(fastest(5, () => validateXml(text))).toBeLessThan(BUDGET_MS.validate);
    });

    it(`validates and parses in under ${BUDGET_MS.parse} ms`, () => {
        expect(fastest(3, () => parseXliff(text))).toBeLessThan(BUDGET_MS.parse);
    });

    it(`serialises the whole document in under ${BUDGET_MS.serialise} ms`, () => {
        const document = parseXliff(text);
        expect(fastest(3, () => serialiseXliff(document))).toBeLessThan(BUDGET_MS.serialise);
    });

    it(`builds the AL tree in under ${BUDGET_MS.tree} ms`, () => {
        // Including the object-type level, because that is what ships.
        const units = [...iterateUnits(parseXliff(text))];
        expect(fastest(3, () => groupRoots(buildAlTree(units)))).toBeLessThan(BUDGET_MS.tree);
    });

    it(`builds the AL tree of the file compiled with namespaced ids in under ${BUDGET_MS.namespacedTree} ms`, () => {
        // Every readable segment is hashed on the way in, so this is the costlier form.
        const units = [...iterateUnits(parseXliff(generateNamespacedFabrikam()))];
        expect(fastest(3, () => groupRoots(buildAlTree(units)))).toBeLessThan(BUDGET_MS.namespacedTree);
    });

    it(`rolls state up in under ${BUDGET_MS.rollUp} ms`, () => {
        const units = [...iterateUnits(parseXliff(text))];
        const states = new Map<string, UnitState>(
            units.map(unit => [unit.id, { state: effectiveState(unit), translate: unit.translate }]),
        );
        const roots = buildAlTree(units);

        expect(fastest(3, () => summariseTree(roots, states))).toBeLessThan(BUDGET_MS.rollUp);
    });

    it(`hints the whole document in under ${BUDGET_MS.hints} ms`, () => {
        // Against the roll-up's budget, since it is the same shape of work: one pass over
        // every unit, recomputed when the document changes and not per keystroke. Timed
        // with the same-as-source check **on**, which is the expensive case — it is the only
        // one that fires in bulk, and off by default precisely because it does.
        const dto = projectDocument(parseXliff(text), { uri: 'file:///x', fileName: LARGE });
        const file = dto.files[0];
        const options = { sourceLanguage: file.sourceLanguage, targetLanguage: file.targetLanguage, sameAsSource: true };

        expect(fastest(3, () => {
            for (const unit of file.units) {
                hintsFor(unit, options);
            }
        })).toBeLessThan(BUDGET_MS.hints);
    });

    it(`builds and serialises the DTO in under ${BUDGET_MS.dto} ms`, () => {
        const document = parseXliff(text);
        const context = { uri: 'file:///x', fileName: LARGE };

        expect(fastest(3, () => JSON.stringify(projectDocument(document, context)))).toBeLessThan(BUDGET_MS.dto);
    });

    it(`turns a keystroke into a filtered tree in under ${BUDGET_MS.keystroke} ms`, () => {
        // Timed over the webview's own pure code: the index is built once per document, so
        // a keystroke is the matcher, the ancestor walk and the re-flatten — not the index.
        const file = projectDocument(parseXliff(text), { uri: 'file:///x', fileName: LARGE }).files[0];
        const unitsById = new Map(file.units.map(unit => [unit.id, unit]));
        const index = buildSearchIndex(file.tree, unitsById);
        const expanded = new Set(expandableKeys(file.tree));

        const measured = fastest(5, () => {
            const matcher = toMatcher('kunde');
            const result = visibleNodes(file.tree, [node => matcher(index.get(node.key) ?? '')]);
            flattenTree(file.tree, expanded, unitsById, result?.visible);
        });
        expect(measured).toBeLessThan(BUDGET_MS.keystroke);
    });

    it(`deserialises the payload and flattens the first screen in under ${BUDGET_MS.firstScreen} ms`, () => {
        // The webview half of first paint, before Vue renders anything: `JSON.parse` on the
        // wire format, then the flatten that `defaultExpandDepth` seeds.
        const payload = JSON.stringify(projectDocument(parseXliff(text), { uri: 'file:///x', fileName: LARGE }));

        expect(fastest(3, () => {
            const document = JSON.parse(payload) as XliffDocumentDto;
            const file = document.files[0];
            const unitsById = new Map(file.units.map(unit => [unit.id, unit]));
            flattenTree(file.tree, new Set(keysToDepth(file.tree, 2)), unitsById);
        })).toBeLessThan(BUDGET_MS.firstScreen);
    });

    it(`builds the search index once per document in under ${BUDGET_MS.searchIndex} ms`, () => {
        // The number that matters is the keystroke above; this is the work that would land
        // on it if the index were ever rebuilt per character.
        const file = projectDocument(parseXliff(text), { uri: 'file:///x', fileName: LARGE }).files[0];
        const unitsById = new Map(file.units.map(unit => [unit.id, unit]));

        const measured = fastest(3, () => buildSearchIndex(file.tree, unitsById));
        expect(measured).toBeLessThan(BUDGET_MS.searchIndex);
    });

    it(`turns an edit into a WorkspaceEdit in under ${BUDGET_MS.edit} ms`, async () => {
        // The whole edit path, not just the writer: the freshness check, the model mutation,
        // a whole-document serialise, and the trim down to one changed line.
        const document = new FakeTextDocument(`/w/${LARGE}`, text);
        const session = new XliffDocumentSession(document as unknown as vscode.TextDocument);
        const view = new XliffDocumentView(session, () => { });
        const unit = { fileIndex: 0, unitId: [...iterateUnits(parseXliff(text))][0].id };

        await view.updateTarget(unit, 'warm up');
        let best = Number.POSITIVE_INFINITY;
        for (let attempt = 0; attempt < 3; attempt++) {
            const started = performance.now();
            await view.updateTarget(unit, `edited ${attempt}`);
            best = Math.min(best, performance.now() - started);
        }
        session.dispose();

        expect(best).toBeLessThan(BUDGET_MS.edit);
    });

    it(`answers ready with the whole document in under ${BUDGET_MS.ready} ms`, () => {
        expect(fastest(3, () => {
            const session = new XliffDocumentSession(
                new FakeTextDocument(`/w/${LARGE}`, text) as unknown as vscode.TextDocument,
            );
            new XliffDocumentView(session, () => { }).sendDocument();
            session.dispose();
        })).toBeLessThan(BUDGET_MS.ready);
    });
});

describe('performance budgets on the AL source of the large app', () => {
    const source = renderApp(fabrikamApp(), FABRIKAM_MANIFEST);
    const files = source.files.filter(file => file.path.endsWith('.al'));

    it(`indexes the headers of every file in under ${BUDGET_MS.alHeaders} ms`, () => {
        expect(fastest(3, () => files.flatMap(file => indexedObjects(file.path, scanHeaders(file.text, source.symbols))))).toBeLessThan(BUDGET_MS.alHeaders);
    });

    it(`locates the slowest unit in under ${BUDGET_MS.locate} ms, its files already read`, () => {
        const outlines = new Map<string, AlOutline>(files.map(file => [file.path, outlineAl(file.text, source.symbols)]));
        const index = [...outlines].flatMap(([path, outline]) => indexedObjects(path, outline));
        const units = [...iterateUnits(parseXliff(text))];
        const locate = (unit: (typeof units)[number]): void => {
            const target = unitTarget(unit.id, generatorNote(unit), unit.alObjectTarget);
            if (target !== undefined) {
                locateUnit(target, candidateObjects(target, index), outlines);
            }
        };

        const slowest = Math.max(...units.map(unit => fastest(3, () => locate(unit))));
        expect(slowest).toBeLessThan(BUDGET_MS.locate);
    });
});

describe('performance budgets on input built to be slow', () => {
    it(`splits a target's edge whitespace in under ${BUDGET_MS.whitespace} ms, however much whitespace sits inside it`, () => {
        const value = `a${' '.repeat(100_000)}b`;
        expect(fastest(5, () => whitespaceParts(value))).toBeLessThan(BUDGET_MS.whitespace);
    });
});

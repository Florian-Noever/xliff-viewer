import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import { XliffDocumentSession } from '../../extension/editor/documentSession';
import { createDocumentSession } from '../../extension/editor/documentView';
import { buildAlTree, groupByObjectType } from '../../extension/xliff/alTree';
import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { serialiseXliff } from '../../extension/xliff/serialise';
import { validateXml } from '../../extension/xliff/validate';
import { Logger } from '../../extension/services/logger';
import { visibleNodes } from '../../webview/ancestorFilter';
import { buildSearchIndex, toMatcher } from '../../webview/composables/useSearch';
import { expandableKeys, flattenTree, keysToDepth } from '../../webview/composables/useTreeFlatten';
import { hintsFor } from '../../webview/validation';
import { iterateUnits } from '../../shared/model';
import { effectiveState, summariseTree } from '../../shared/state';
import { FakeTextDocument } from '../__mocks__/vscode';

import type * as vscode from 'vscode';
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

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const LARGE = 'Fabrikam Base.de-DE.xlf';
const text = readFileSync(`${FIXTURES}/${LARGE}`, 'utf8');

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
    it('validates in under 60 ms', () => {
        expect(fastest(5, () => validateXml(text))).toBeLessThan(60);
    });

    it('validates and parses in under 100 ms', () => {
        expect(fastest(3, () => parseXliff(text))).toBeLessThan(100);
    });

    it('serialises the whole document in under 60 ms', () => {
        const document = parseXliff(text);
        expect(fastest(3, () => serialiseXliff(document))).toBeLessThan(60);
    });

    it('builds the AL tree in under 60 ms', () => {
        // Including the object-type level, because that is what ships.
        const units = [...iterateUnits(parseXliff(text))];
        expect(fastest(3, () => groupByObjectType(buildAlTree(units)))).toBeLessThan(60);
    });

    it('rolls state up in under 40 ms', () => {
        const units = [...iterateUnits(parseXliff(text))];
        const states = new Map<string, UnitState>(
            units.map(unit => [unit.id, { state: effectiveState(unit), translate: unit.translate }]),
        );
        const roots = buildAlTree(units);

        expect(fastest(3, () => summariseTree(roots, states))).toBeLessThan(40);
    });

    it('hints the whole document in under 40 ms', () => {
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
        })).toBeLessThan(40);
    });

    it('builds and serialises the DTO in under 50 ms', () => {
        const document = parseXliff(text);
        const context = { uri: 'file:///x', fileName: LARGE };

        expect(fastest(3, () => JSON.stringify(projectDocument(document, context)))).toBeLessThan(50);
    });

    it('turns a keystroke into a filtered tree in under 50 ms', () => {
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
        expect(measured).toBeLessThan(50);
    });

    it('deserialises the payload and flattens the first screen in under 100 ms', () => {
        // The webview half of first paint, before Vue renders anything: `JSON.parse` on the
        // wire format, then the flatten that `defaultExpandDepth` seeds.
        const payload = JSON.stringify(projectDocument(parseXliff(text), { uri: 'file:///x', fileName: LARGE }));

        expect(fastest(3, () => {
            const document = JSON.parse(payload) as XliffDocumentDto;
            const file = document.files[0];
            const unitsById = new Map(file.units.map(unit => [unit.id, unit]));
            flattenTree(file.tree, new Set(keysToDepth(file.tree, 2)), unitsById);
        })).toBeLessThan(100);
    });

    it('builds the search index once per document in under 100 ms', () => {
        // The number that matters is the keystroke above; this is the work that would land
        // on it if the index were ever rebuilt per character.
        const file = projectDocument(parseXliff(text), { uri: 'file:///x', fileName: LARGE }).files[0];
        const unitsById = new Map(file.units.map(unit => [unit.id, unit]));

        const measured = fastest(3, () => buildSearchIndex(file.tree, unitsById));
        expect(measured).toBeLessThan(100);
    });

    it('turns an edit into a WorkspaceEdit in under 100 ms', async () => {
        // The whole edit path, not just the writer: the freshness check, the model mutation,
        // a whole-document serialise, and the trim down to one changed line.
        const document = new FakeTextDocument(`/w/${LARGE}`, text);
        const session = new XliffDocumentSession(document as unknown as vscode.TextDocument);
        const view = createDocumentSession(session, () => { });
        const unit = { fileIndex: 0, unitId: [...iterateUnits(parseXliff(text))][0].id };

        await view.updateTarget(unit, 'warm up');
        let best = Number.POSITIVE_INFINITY;
        for (let attempt = 0; attempt < 3; attempt++) {
            const started = performance.now();
            await view.updateTarget(unit, `edited ${attempt}`);
            best = Math.min(best, performance.now() - started);
        }
        session.dispose();

        expect(best).toBeLessThan(100);
    });

    it('answers ready with the whole document in under 250 ms', () => {
        expect(fastest(3, () => {
            const session = new XliffDocumentSession(
                new FakeTextDocument(`/w/${LARGE}`, text) as unknown as vscode.TextDocument,
            );
            void createDocumentSession(session, () => { }).sendDocument();
            session.dispose();
        })).toBeLessThan(250);
    });
});

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'perf');
});

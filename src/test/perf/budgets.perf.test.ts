import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import { XliffDocumentSession } from '../../extension/editor/documentSession';
import { createDocumentSession } from '../../extension/editor/documentView';
import { buildAlTree } from '../../extension/xliff/alTree';
import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { serialiseXliff } from '../../extension/xliff/serialise';
import { validateXml } from '../../extension/xliff/validate';
import { Logger } from '../../extension/services/logger';
import { iterateUnits } from '../../shared/model';
import { effectiveState, summariseTree } from '../../shared/state';
import { FakeTextDocument } from '../__mocks__/vscode';

import type * as vscode from 'vscode';
import type { UnitState } from '../../shared/state';

/**
 * Every wall-clock row of MASTER_PLAN §16, in one file.
 *
 * They live apart from the tests of the same code for one reason: they are the only
 * assertions in the suite whose result depends on what else the machine is doing. Run
 * alongside the other three Vitest projects they measured 65 ms against a 60 ms budget
 * while measuring 23 ms alone — a timing assertion that fails because another project is
 * busy is not an assertion. The `perf` project runs them one file at a time, after
 * everything else.
 *
 * Keeping them together also matches how they are used: a review checkpoint has to check
 * §16 against a fresh measurement, and §16 is one table.
 */

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));
const LARGE = 'Fabrikam Base.de-DE.xlf';
const text = readFileSync(`${EXAMPLES}/${LARGE}`, 'utf8');

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

describe('§16, measured on the realistic worst case', () => {
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
        const units = [...iterateUnits(parseXliff(text))];
        expect(fastest(3, () => buildAlTree(units))).toBeLessThan(60);
    });

    it('rolls state up in under 40 ms', () => {
        const units = [...iterateUnits(parseXliff(text))];
        const states = new Map<string, UnitState>(
            units.map(unit => [unit.id, { state: effectiveState(unit), translate: unit.translate }]),
        );
        const roots = buildAlTree(units);

        expect(fastest(3, () => summariseTree(roots, states))).toBeLessThan(40);
    });

    it('builds and serialises the DTO in under 50 ms', () => {
        const document = parseXliff(text);
        const context = { uri: 'file:///x', fileName: LARGE };

        expect(fastest(3, () => JSON.stringify(projectDocument(document, context)))).toBeLessThan(50);
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

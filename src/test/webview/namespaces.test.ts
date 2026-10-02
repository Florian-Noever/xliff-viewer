import { describe, expect, it } from 'vitest';

import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { summariseTree } from '../../shared/state';
import { visibleNodes } from '../../webview/ancestorFilter';
import { buildSearchIndex, toMatcher } from '../../webview/composables/useSearch';
import { indexNodes, reconstructGeneratorNote } from '../../webview/generatorNote';
import { appUnits, translationRoot } from '../fixtures/alApp';
import { FIXTURE } from '../fixtures/corpus';
import { NORTHWIND } from '../fixtures/northwind';

import type { AlNodeDto, TransUnitDto } from '../../shared/dto';
import type { UnitState } from '../../shared/state';

// Read with a glob: under jsdom, `fileURLToPath(new URL(…))` fails on jsdom's own `URL`,
// and the webview tsconfig has no node types.
const files: Record<string, string> = import.meta.glob('../fixtures/xliff/Northwind App.de-DE.xlf', { query: '?raw', import: 'default', eager: true });
const [text] = Object.values(files);
const [file] = projectDocument(parseXliff(text), { uri: `file:///${FIXTURE.namespacedGerman}`, fileName: FIXTURE.namespacedGerman }).files;
const unitsById = new Map<string, TransUnitDto>(file.units.map(unit => [unit.id, unit]));

function* walk(nodes: readonly AlNodeDto[]): Generator<AlNodeDto> {
    for (const node of nodes) {
        yield node;
        yield* walk(node.children);
    }
}

describe('a namespaced file in the webview', () => {
    it('rebuilds the note the compiler wrote, for every unit its declaring object is filed under', () => {
        // A folded unit's note names the extension that declares it, while the tree files it
        // under the object it extends: those two cannot agree, and are left out.
        const index = indexNodes(file.tree);
        const unfolded = appUnits(NORTHWIND).filter(unit => translationRoot(NORTHWIND, unit.declaring) === unit.declaring);

        expect(unfolded.length).toBeGreaterThan(30);
        for (const unit of unfolded) {
            expect(reconstructGeneratorNote(unit.id, index), unit.id).toBe(unit.generatorNote);
        }
    });

    it('lets a search reach a unit three levels below its namespace', () => {
        const search = buildSearchIndex(file.tree, unitsById);
        const matcher = toMatcher('Größe');
        const result = visibleNodes(file.tree, [node => matcher(search.get(node.key) ?? '')]);
        const namespace = file.tree.find(node => node.name === 'Northwind.Sales');

        expect(result?.count).toBeGreaterThan(0);
        expect(namespace === undefined ? false : result?.visible.has(namespace.key)).toBe(true);
        expect([...walk(file.tree)].filter(node => node.name === 'Größe').every(node => result?.visible.has(node.key))).toBe(true);
    });

    it('lets a state filter reach the untranslated unit, and open the path to it', () => {
        const empty = file.units.filter(unit => unit.state === 'empty');
        const result = visibleNodes(file.tree, [node => unitsById.get(node.key)?.state === 'empty']);

        expect(empty).toHaveLength(1);
        expect(result?.count).toBe(1);
        expect(result?.visible.size).toBeGreaterThanOrEqual(4);
    });

    it('rolls a namespace up from its groups, and a group from its objects', () => {
        const states = new Map<string, UnitState>(file.units.map(unit => [unit.id, { state: unit.state, translate: unit.translate }]));
        const summaries = summariseTree(file.tree, states);

        for (const namespace of file.tree) {
            const total = namespace.children.reduce((sum, child) => sum + (summaries.get(child.key)?.total ?? 0), 0);
            expect(summaries.get(namespace.key)?.total, namespace.key).toBe(total);
        }
        expect(file.tree.reduce((sum, node) => sum + (summaries.get(node.key)?.total ?? 0), 0)).toBe(file.units.length);
    });
});

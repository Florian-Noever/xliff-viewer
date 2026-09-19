import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildAlTree, groupByObjectType, iterateNodes, iterateUnitNodes, OBJECT_TYPE_GROUP_PREFIX } from '../../extension/xliff/alTree';
import { parseXliff } from '../../extension/xliff/parser';
import { iterateUnits } from '../../shared/model';

import type { XliffNote, XliffTransUnit } from '../../shared/model';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const CORPUS = ['Contoso App.g.xlf', 'Contoso App.en-US.xlf', 'Contoso App.de-DE.xlf', 'Fabrikam Base.de-DE.xlf', 'minimal.xlf'];
/** Every corpus file but the hand-written one, whose single id has no AL structure. */
const AL_CORPUS = CORPUS.filter(name => name !== 'minimal.xlf');
const unitsOf = (name: string) => [...iterateUnits(parseXliff(readFileSync(`${FIXTURES}/${name}`, 'utf8')))];

function unit(id: string, generatorNote?: string): XliffTransUnit {
    const notes: XliffNote[] = generatorNote === undefined
        ? []
        : [{ attributes: { from: 'Xliff Generator' }, from: 'Xliff Generator', value: generatorNote }];
    return { attributes: { id }, id, translate: true, source: 's', notes };
}

describe('the large corpus file', () => {
    const units = unitsOf('Fabrikam Base.de-DE.xlf');
    const roots = buildAlTree(units);

    it('yields the known number of root objects', () => {
        expect(roots).toHaveLength(230);
    });

    it('places every unit on exactly one node', () => {
        const carrying = [...iterateUnitNodes(roots)];
        expect(carrying).toHaveLength(units.length);
        expect(new Set(carrying.map(node => node.unitId)).size).toBe(units.length);
    });

    it('gives every node a key that is its own id prefix', () => {
        for (const node of iterateNodes(roots)) {
            expect(node.key.split(' - '), node.key).toHaveLength(node.depth + 1);
        }
    });

    it('names every node it can', () => {
        const unnamed = [...iterateNodes(roots)].filter(node => node.segment.name === undefined);
        expect(unnamed).toHaveLength(0);
    });

});

describe('grouping is by hash, never by name', () => {
    // AL hashes a symbol's *name*, so a Table and a Page of one name share a hash.
    const largeUnits = unitsOf('Fabrikam Base.de-DE.xlf');
    const largeRoots = buildAlTree(largeUnits);
    const pages = new Map(largeRoots.filter(node => node.segment.type === 'Page').map(node => [node.segment.hash, node]));
    const table = largeRoots.find(node => node.segment.type === 'Table' && pages.has(node.segment.hash));
    const page = pages.get(table?.segment.hash ?? '');

    it('keeps an object whose name another type shares as one root, with every unit under it', () => {
        const root = largeRoots.filter(node => node.key === table?.key);
        const own = largeUnits.filter(candidate => candidate.id.startsWith(`${table?.key} - `));

        expect(root).toHaveLength(1);
        expect(own.length).toBeGreaterThan(0);
        expect([...iterateUnitNodes(root)]).toHaveLength(own.length);
    });

    it('separates same-name objects that also share a hash', () => {
        expect(table).toBeDefined();
        expect(page?.segment.name).toBe(table?.segment.name);
        expect(page?.segment.hash).toBe(table?.segment.hash);
        expect(page?.key).not.toBe(table?.key);
    });

    it('keys on type and hash together, so a shared hash cannot merge nodes', () => {
        const roots = buildAlTree([
            unit('Table 999 - Property 1', 'Table Shared - Property Caption'),
            unit('Page 999 - Property 1', 'Page Shared - Property Caption'),
        ]);

        expect(roots).toHaveLength(2);
        expect(roots.map(node => node.key)).toEqual(['Table 999', 'Page 999']);
    });

    it('separates two objects that share a name but differ by hash', () => {
        const roots = buildAlTree([
            unit('Table 111 - Property 1', 'Table Customer - Property Caption'),
            unit('Table 222 - Property 1', 'Table Customer - Property Caption'),
        ]);

        expect(roots).toHaveLength(2);
        expect(roots.map(node => node.segment.hash)).toEqual(['111', '222']);
        expect(roots.every(node => node.segment.name === 'Customer')).toBe(true);
    });

    it('merges two units of the same object into one root', () => {
        const roots = buildAlTree([
            unit('Table 111 - Property 1', 'Table Customer - Property Caption'),
            unit('Table 111 - Property 2', 'Table Customer - Property ToolTip'),
        ]);

        expect(roots).toHaveLength(1);
        expect(roots[0].children).toHaveLength(2);
    });
});

describe('shape', () => {
    it('handles a six-segment id without special-casing depth', () => {
        const id = 'A 1 - B 2 - C 3 - D 4 - E 5 - F 6';
        const roots = buildAlTree([unit(id)]);

        let node = roots[0];
        const seen = [node.segment.type];
        while (node.children.length > 0) {
            node = node.children[0];
            seen.push(node.segment.type);
        }

        expect(seen).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
        expect(node.depth).toBe(5);
        expect(node.unitId).toBe(id);
    });

    it('keeps children in first-appearance order, not sorted', () => {
        const roots = buildAlTree([
            unit('Table 1 - Property 30'),
            unit('Table 1 - Property 10'),
            unit('Table 1 - Property 20'),
        ]);
        expect(roots[0].children.map(node => node.segment.hash)).toEqual(['30', '10', '20']);
    });

    it('handles an id with no AL structure as a single flat node', () => {
        const roots = buildAlTree(unitsOf('minimal.xlf'));

        expect(roots).toHaveLength(1);
        expect(roots[0].key).toBe('1');
        expect(roots[0].segment).toEqual({ type: '1', hash: '' });
        expect(roots[0].unitId).toBe('1');
        expect(roots[0].children).toHaveLength(0);
    });

    it('carries a unit on a node that also has children', () => {
        // Legal: one unit's id is another's prefix.
        const roots = buildAlTree([unit('Table 1'), unit('Table 1 - Property 2')]);

        expect(roots).toHaveLength(1);
        expect(roots[0].unitId).toBe('Table 1');
        expect(roots[0].children).toHaveLength(1);
        expect([...iterateUnitNodes(roots)]).toHaveLength(2);
    });

    it('leaves a node unnamed rather than guessing when the note does not parse', () => {
        const roots = buildAlTree([unit('Table 1 - Property 2', 'utterly unrelated text')]);
        expect(roots[0].segment.name).toBeUndefined();
        expect(roots[0].children[0].segment.name).toBeUndefined();
    });

    it('fills a name in from a later unit that has a usable note', () => {
        const roots = buildAlTree([
            unit('Table 1 - Property 2'),
            unit('Table 1 - Property 3', 'Table Customer - Property ToolTip'),
        ]);
        expect(roots[0].segment.name).toBe('Customer');
    });

    it('returns an empty tree for no units', () => {
        expect(buildAlTree([])).toEqual([]);
    });
});


describe('the object-type level', () => {
    const grouped = (...ids: string[]) => groupByObjectType(buildAlTree(ids.map(id => unit(id))));

    it('wraps the roots in one node per type', () => {
        const tree = grouped('Table 1 - Property 9', 'Page 2 - Property 9', 'Table 3 - Property 9');

        expect(tree.map(node => node.key)).toEqual(['type:Table', 'type:Page']);
        expect(tree[0].children.map(node => node.key)).toEqual(['Table 1', 'Table 3']);
        expect(tree[1].children.map(node => node.key)).toEqual(['Page 2']);
    });

    it('labels each group with its plural and how many objects it holds', () => {
        const tree = grouped('Table 1 - Property 9', 'Table 3 - Property 9', 'PageExtension 4 - Property 9');

        expect(tree.map(node => node.segment.name)).toEqual(['Tables (2)', 'PageExtensions (1)']);
    });

    it('counts objects, not units — the progress bar already counts those', () => {
        const tree = grouped('Table 1 - Property 1', 'Table 1 - Property 2', 'Table 1 - Field 3 - Property 4');

        expect(tree[0].segment.name).toBe('Tables (1)');
    });

    it('keeps first-appearance order, at both levels', () => {
        const tree = grouped('Page 9 - Property 1', 'Table 1 - Property 1', 'Page 2 - Property 1');

        expect(tree.map(node => node.segment.type)).toEqual(['Page', 'Table']);
        expect(tree[0].children.map(node => node.key)).toEqual(['Page 9', 'Page 2']);
    });

    it('carries no unit and no hash of its own', () => {
        const [group] = grouped('Table 1 - Property 9');

        expect(group.unitId).toBeUndefined();
        expect(group.segment.hash).toBe('');
    });

    it('leaves a root alone when its id has no type to group by', () => {
        const tree = grouped('Table 1 - Property 9', '1');

        expect(tree.map(node => node.key)).toEqual(['type:Table', '1']);
    });

    it('does nothing to an empty tree', () => {
        expect(groupByObjectType([])).toEqual([]);
    });

    it('keeps a Table and a Page of one name apart, in different groups', () => {
        // The hash is of the *name*, so those two collide on hash alone.
        const tree = grouped('Table 1932994227 - Property 1', 'Page 1932994227 - Property 1');

        expect(tree.map(node => node.key)).toEqual(['type:Table', 'type:Page']);
        expect(tree.every(node => node.children.length === 1)).toBe(true);
    });

    it('groups the large corpus file into its known object types, keeping every root', () => {
        const tree = groupByObjectType(buildAlTree(unitsOf('Fabrikam Base.de-DE.xlf')));

        expect(tree).toHaveLength(9);
        expect(tree.reduce((sum, group) => sum + group.children.length, 0)).toBe(230);
    });
});

describe('a group key can never be a unit id', () => {
    it('holds against every id in the corpus', () => {
        // A node carries a unit exactly when its key IS that unit's id. A group carries
        // none, so its key must be one no id can produce.
        for (const name of CORPUS) {
            for (const each of unitsOf(name)) {
                expect(each.id.includes(':'), `${name}: ${each.id}`).toBe(false);
            }
        }
    });

    it('holds for every group the corpus actually produces', () => {
        for (const name of AL_CORPUS) {
            const all = unitsOf(name);
            const ids = new Set(all.map(each => each.id));
            const groups = groupByObjectType(buildAlTree(all)).filter(node => node.key.startsWith(OBJECT_TYPE_GROUP_PREFIX));

            expect(groups.length, name).toBeGreaterThan(0);
            for (const group of groups) {
                expect(ids.has(group.key), `${name}: ${group.key}`).toBe(false);
            }
        }
    });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildAlTree, groupRoots, iterateNodes, iterateUnitNodes, NO_NAMESPACE_GROUP_KEY, OBJECT_TYPE_GROUP_PREFIX } from '../../extension/xliff/alTree';
import { alNameHash } from '../../extension/xliff/alNameHash';
import { parseXliff } from '../../extension/xliff/parser';
import { iterateUnits } from '../../shared/model';

import type { XliffNote, XliffTransUnit } from '../../shared/model';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const CORPUS = ['Contoso App.g.xlf', 'Contoso App.en-US.xlf', 'Contoso App.de-DE.xlf', 'Fabrikam Base.de-DE.xlf', 'minimal.xlf', 'Northwind App.g.xlf', 'Northwind App.de-DE.xlf'];
/** Every corpus file but the hand-written one, whose single id has no AL structure. */
const AL_CORPUS = CORPUS.filter(name => name !== 'minimal.xlf');
const parsed = new Map<string, ReturnType<typeof parseXliff>>();
/** Parsed once per file: several tests walk every file, and the large one is megabytes. */
const unitsOf = (name: string) => {
    let document = parsed.get(name);
    if (document === undefined) {
        document = parseXliff(readFileSync(`${FIXTURES}/${name}`, 'utf8'));
        parsed.set(name, document);
    }
    return [...iterateUnits(document)];
};

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
    const grouped = (...ids: string[]) => groupRoots(buildAlTree(ids.map(id => unit(id))));

    it('wraps the roots in one node per type', () => {
        const tree = grouped('Table 1 - Property 9', 'Page 2 - Property 9', 'Table 3 - Property 9');

        expect(tree.map(node => node.key)).toEqual([`${OBJECT_TYPE_GROUP_PREFIX}Table`, `${OBJECT_TYPE_GROUP_PREFIX}Page`]);
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

        expect(tree.map(node => node.key)).toEqual([`${OBJECT_TYPE_GROUP_PREFIX}Table`, '1']);
    });

    it('does nothing to an empty tree', () => {
        expect(groupRoots([])).toEqual([]);
    });

    it('keeps a Table and a Page of one name apart, in different groups', () => {
        // The hash is of the *name*, so those two collide on hash alone.
        const tree = grouped(`Table ${alNameHash('Contoso Customer')} - Property 1`, `Page ${alNameHash('Contoso Customer')} - Property 1`);

        expect(tree.map(node => node.key)).toEqual([`${OBJECT_TYPE_GROUP_PREFIX}Table`, `${OBJECT_TYPE_GROUP_PREFIX}Page`]);
        expect(tree.every(node => node.children.length === 1)).toBe(true);
    });

    it('groups the large corpus file into its known object types, keeping every root', () => {
        const tree = groupRoots(buildAlTree(unitsOf('Fabrikam Base.de-DE.xlf')));

        expect(tree).toHaveLength(9);
        expect(tree.reduce((sum, group) => sum + group.children.length, 0)).toBe(230);
    });
});

describe('canonical merging', () => {
    const hashed = (...path: readonly (readonly [string, string])[]) => path.map(([type, name]) => `${type} ${alNameHash(name)}`).join(' - ');

    it('merges the readable and the hashed form of one object into one node', () => {
        const roots = buildAlTree([
            unit('Table "Contoso Item" - Property Caption'),
            unit(hashed(['Table', 'Contoso Item'], ['Field', 'Größe'], ['Property', 'Caption']), 'Table Contoso Item - Field Größe - Property Caption'),
        ]);

        expect(roots).toHaveLength(1);
        expect(roots[0].segment.name).toBe('Contoso Item');
        expect(roots[0].children.map(node => node.segment.name)).toEqual(['Caption', 'Größe']);
    });

    it('keys a container by its canonical path and a unit node by its own id', () => {
        const id = 'Table "Contoso Item" - Field "No." - Property Caption';
        const roots = buildAlTree([unit(id)]);
        const field = roots[0].children[0];

        expect(roots[0].key).toBe(`Table ${alNameHash('Contoso Item')}`);
        expect(field.key).toBe(`Table ${alNameHash('Contoso Item')} - Field ${alNameHash('No.')}`);
        expect(field.children[0].key).toBe(id);
        expect(field.children[0].unitId).toBe(id);
    });

    it('keeps a quoted name that contains the separator as one segment', () => {
        const roots = buildAlTree([
            unit('Report "Contoso Sales - Quote" - Property Caption'),
            unit('Report "Contoso Sales - Invoice" - Property Caption'),
        ]);

        expect(roots.map(node => node.segment.name)).toEqual(['Contoso Sales - Quote', 'Contoso Sales - Invoice']);
        expect(roots.every(node => node.children.length === 1)).toBe(true);
    });

    it('keeps a second unit on the same canonical path as a leaf of its own', () => {
        const readable = 'Table "Contoso Item" - Property Caption';
        const other = hashed(['Table', 'Contoso Item'], ['Property', 'Caption']);
        const roots = buildAlTree([unit(readable), unit(other)]);

        expect(roots).toHaveLength(1);
        expect(roots[0].children).toHaveLength(2);
        expect([...iterateUnitNodes(roots)].map(node => node.key)).toEqual([readable, other]);
    });
});

describe('naming', () => {
    it('names every segment of a readable id without a note', () => {
        const roots = buildAlTree([unit('Namespace Contoso.Sales - Table "Contoso Item" - Field "No." - Property Caption')]);

        expect([...iterateNodes(roots)].map(node => node.segment.name)).toEqual(['Contoso.Sales', 'Contoso Item', 'No.', 'Caption']);
    });

    it('lets an all-digit readable name, an API method id, yield to the note', () => {
        const roots = buildAlTree([unit('Page "Contoso API" - Method "7001"', 'Page Contoso API - Method ReleaseOrder')]);

        expect(roots[0].children[0].segment.name).toBe('ReleaseOrder');
    });

    it('names a folded extension\'s members, and not the object after the extension', () => {
        // The note names the extension that declares the field; the id files it under the table.
        const root = `Table ${alNameHash('Contoso Item')}`;
        const folded = unit(`${root} - Field ${alNameHash('Extra')} - Property ${alNameHash('Caption')}`, 'TableExtension Contoso Item Ext. - Field Extra - Property Caption');

        const [table] = buildAlTree([folded]);

        expect(table.segment.name).toBeUndefined();
        expect(table.children[0].segment.name).toBe('Extra');
        expect(table.children[0].children[0].segment.name).toBe('Caption');
    });

    it('names the object from a unit of its own, alongside a folded one', () => {
        const root = `Table ${alNameHash('Contoso Item')}`;
        const [table] = buildAlTree([
            unit(`${root} - Field ${alNameHash('Extra')} - Property ${alNameHash('Caption')}`, 'TableExtension Contoso Item Ext. - Field Extra - Property Caption'),
            unit(`${root} - Property ${alNameHash('Caption')}`, 'Table Contoso Item - Property Caption'),
        ]);

        expect(table.segment.name).toBe('Contoso Item');
    });

    it('names an all-digit enum value by its digits — only a method\'s digits are an id', () => {
        const [enumeration] = buildAlTree([unit('Enum "Contoso Codes" - EnumValue "10" - Property Caption')]);

        expect(enumeration.children[0].segment.name).toBe('10');
    });

    it('merges a negative API method id, written unquoted, with its hashed form', () => {
        const page = `Page ${alNameHash('Contoso API')}`;
        const roots = buildAlTree([
            unit('Page "Contoso API" - Method -7007001', 'Page Contoso API - Method ReleaseOrder'),
            unit(`${page} - Method ${alNameHash('-7007001')} - NamedType ${alNameHash('DoneMsg')}`, 'Page Contoso API - Method ReleaseOrder - NamedType DoneMsg'),
        ]);

        expect(roots).toHaveLength(1);
        expect(roots[0].children).toHaveLength(1);
    });
});

describe('the namespace level', () => {
    const grouped = (...ids: string[]) => groupRoots(buildAlTree(ids.map(id => unit(id))));

    it('puts the namespaces first, each with type groups of its own', () => {
        const tree = grouped(
            'Namespace Contoso.Sales - Table Order - Property Caption',
            'Namespace Contoso.Sales - Page Order - Property Caption',
            'Namespace Contoso.Common - Table Setup - Property Caption',
        );
        const sales = `Namespace ${alNameHash('Contoso.Sales')}`;

        expect(tree.map(node => node.segment.name)).toEqual(['Contoso.Sales', 'Contoso.Common']);
        expect(tree[0].children.map(node => node.key)).toEqual([`${OBJECT_TYPE_GROUP_PREFIX}${sales}/Table`, `${OBJECT_TYPE_GROUP_PREFIX}${sales}/Page`]);
        expect(tree[0].children.map(node => node.segment.name)).toEqual(['Tables (1)', 'Pages (1)']);
        expect(tree[0].synthetic).toBeUndefined();
        expect(tree[0].children.every(node => node.synthetic === true)).toBe(true);
    });

    it('gathers the objects without a namespace under one group, in first-appearance order', () => {
        const tree = grouped(
            'Codeunit "Contoso Legacy" - Method Run - NamedType DoneMsg',
            'Namespace Contoso.Sales - Table Order - Property Caption',
            'Table "Contoso Old" - Property Caption',
        );

        expect(tree.map(node => node.key)).toEqual([NO_NAMESPACE_GROUP_KEY, `Namespace ${alNameHash('Contoso.Sales')}`]);
        expect(tree[0].segment.name).toBe('(no namespace)');
        expect(tree[0].synthetic).toBe(true);
        expect(tree[0].children.map(node => node.key)).toEqual([`${OBJECT_TYPE_GROUP_PREFIX}${NO_NAMESPACE_GROUP_KEY}/Codeunit`, `${OBJECT_TYPE_GROUP_PREFIX}${NO_NAMESPACE_GROUP_KEY}/Table`]);
    });

    it('keeps two objects of one type and name apart when their namespaces differ', () => {
        const tree = grouped(
            'Namespace Contoso.Sales - Table Order - Property Caption',
            'Namespace Contoso.Purchasing - Table Order - Property Caption',
        );
        const tables = tree.flatMap(namespace => namespace.children).flatMap(group => group.children);

        expect(tables).toHaveLength(2);
        expect(new Set(tables.map(node => node.key)).size).toBe(2);
    });

    it('leaves a file without namespace segments exactly as before', () => {
        expect(grouped('Table 1 - Property 9', 'Page 2 - Property 9').map(node => node.key)).toEqual([`${OBJECT_TYPE_GROUP_PREFIX}Table`, `${OBJECT_TYPE_GROUP_PREFIX}Page`]);
    });
});

describe('the namespaced corpus file', () => {
    const units = unitsOf('Northwind App.de-DE.xlf');
    const tree = groupRoots(buildAlTree(units));
    const objects = [...iterateNodes(tree)].filter(node => node.depth === 1 && node.synthetic !== true);

    it('reads namespace, object type, object, with a group for the objects without a namespace', () => {
        expect(tree.map(node => node.segment.name)).toEqual([
            'Northwind.Common', 'Northwind.Sales', 'Northwind.Purchasing', '(no namespace)',
            'Northwind.Logistics.Warehousing.Outbound.Shipping.Documents.Printing.Templates.Configuration.Validation.Rules',
        ]);
        for (const namespace of tree) {
            expect(namespace.children.every(group => group.synthetic === true), namespace.key).toBe(true);
        }
    });

    it('keeps each object in one node, whichever form its ids take', () => {
        const orders = objects.filter(node => node.segment.name === 'Northwind Order');
        const sales = orders.find(node => node.key.startsWith(`Namespace ${alNameHash('Northwind.Sales')} - `));
        const template = objects.filter(node => node.segment.name === 'Northwind Print Template Mgt.');

        expect(orders).toHaveLength(2);
        expect(sales?.children.map(node => node.segment.name)).toContain('Größe');
        expect(template).toHaveLength(1);
        expect(template[0].children).toHaveLength(2);
    });

    it('places every unit on a node keyed by its own id', () => {
        const carrying = [...iterateUnitNodes(tree)];

        expect(carrying).toHaveLength(units.length);
        expect(carrying.every(node => node.key === node.unitId)).toBe(true);
    });

    it('names every node', () => {
        expect([...iterateNodes(tree)].filter(node => node.segment.name === undefined)).toHaveLength(0);
    });
});

describe('a group key can never be a node key', () => {
    it('holds because no node of any corpus file has a key that starts like a group key', () => {
        for (const name of CORPUS) {
            for (const node of iterateNodes(buildAlTree(unitsOf(name)))) {
                expect(/^[a-z]+:/.test(node.key), `${name}: ${node.key}`).toBe(false);
            }
        }
    });

    it('holds for every group the corpus produces, at every level', () => {
        for (const name of AL_CORPUS) {
            const all = unitsOf(name);
            const ids = new Set(all.map(each => each.id));
            const groups = [...iterateNodes(groupRoots(buildAlTree(all)))].filter(node => node.synthetic === true);

            expect(groups.length, name).toBeGreaterThan(0);
            for (const group of groups) {
                expect(ids.has(group.key), `${name}: ${group.key}`).toBe(false);
                expect(group.key.startsWith(OBJECT_TYPE_GROUP_PREFIX) || group.key === NO_NAMESPACE_GROUP_KEY, `${name}: ${group.key}`).toBe(true);
            }
        }
    });
});


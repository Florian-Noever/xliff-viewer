import { generatorNote, namesFromNote, SEGMENT_SEPARATOR } from './names';

import type { AlNode, XliffTransUnit } from '../../shared/model';

/**
 * Builds the object → member → unit hierarchy from trans-unit ids.
 *
 * **The tree comes from the id, never from the note.** The hash in each segment is stable,
 * unique and language-independent; names are display text that may be missing, ambiguous,
 * or contain the ` - ` separator itself.
 */

interface MutableAlNode {
    readonly key: string;
    segment: { type: string; hash: string; name?: string };
    readonly depth: number;
    readonly children: MutableAlNode[];
    unitId?: string;
}

/**
 * Groups units into a tree.
 *
 * Takes **units rather than a document** so the caller chooses the scope: the DTO is
 * per-`<file>`, and XLIFF scopes ids to their `<file>`, so a document-wide tree would
 * merge two files' hierarchies and let identical ids collide.
 *
 * One pass, O(units × depth). Children keep first-appearance order — file order is
 * meaningful and is never re-sorted here.
 */
export function buildAlTree(units: Iterable<XliffTransUnit>): AlNode[] {
    const roots: MutableAlNode[] = [];
    const byKey = new Map<string, MutableAlNode>();

    for (const unit of units) {
        const parts = unit.id.split(SEGMENT_SEPARATOR);
        const names = namesFromNote(unit.id, generatorNote(unit));

        let key = '';
        let siblings = roots;
        let node: MutableAlNode | undefined;

        for (let depth = 0; depth < parts.length; depth++) {
            const part = parts[depth];
            key = depth === 0 ? part : key + SEGMENT_SEPARATOR + part;

            node = byKey.get(key);
            if (node === undefined) {
                const space = part.indexOf(' ');
                node = {
                    key,
                    segment: space < 0
                        ? { type: part, hash: '' }
                        : { type: part.slice(0, space), hash: part.slice(space + 1) },
                    depth,
                    children: [],
                };
                byKey.set(key, node);
                siblings.push(node);
            }

            // An earlier unit may have created this node without a usable note; fill the
            // name in if a later one supplies it.
            if (node.segment.name === undefined && names?.[depth] !== undefined) {
                node.segment = { ...node.segment, name: names[depth] };
            }

            siblings = node.children;
        }

        if (node !== undefined) {
            node.unitId = unit.id;
        }
    }

    return roots;
}

/**
 * The namespace a group key lives in.
 *
 * A trans-unit id is ` - `-separated `<SymbolType> <hash>` segments, so it cannot contain a
 * colon and no group key can equal one: a node carries a unit exactly when its key **is**
 * that unit's id, and a group carries none.
 */
export const OBJECT_TYPE_GROUP_PREFIX = 'type:';

/**
 * Wraps the roots in one node per object type.
 *
 * A file's objects are otherwise one flat list in file order, and finding "the tables"
 * means scrolling past everything else. The type is already in every id, so this adds a
 * level rather than information.
 *
 * A root whose id did not parse as `<SymbolType> <hash>` has no type to group by and stays
 * where it is, in file order beside the groups.
 */
export function groupByObjectType(roots: readonly AlNode[]): AlNode[] {
    const order: (AlNode | string)[] = [];
    const groups = new Map<string, { readonly type: string; readonly members: AlNode[] }>();

    for (const root of roots) {
        if (root.segment.hash === '') {
            order.push(root);
            continue;
        }

        const key = OBJECT_TYPE_GROUP_PREFIX + root.segment.type;
        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, { type: root.segment.type, members: [root] });
            order.push(key);
        } else {
            group.members.push(root);
        }
    }

    return order.map((entry) => {
        if (typeof entry !== 'string') {
            return entry;
        }
        const group = groups.get(entry);
        if (group === undefined) {
            throw new Error(`No members were collected for the object-type group "${entry}".`);
        }
        return {
            key: entry,
            // The count is of **objects**, not units: the progress bar already carries the
            // unit counts, and "Tables (12)" answers a different question.
            segment: { type: group.type, hash: '', name: `${group.type}s (${group.members.length})` },
            depth: 0,
            children: group.members,
        };
    });
}

/** Walks the tree depth-first, in the order the nodes were created. */
export function* iterateNodes(nodes: readonly AlNode[]): Generator<AlNode> {
    for (const node of nodes) {
        yield node;
        yield* iterateNodes(node.children);
    }
}

/** Every node carrying a unit, depth-first. */
export function* iterateUnitNodes(nodes: readonly AlNode[]): Generator<AlNode> {
    for (const node of iterateNodes(nodes)) {
        if (node.unitId !== undefined) {
            yield node;
        }
    }
}

import { generatorNote, namesFromNote, SEGMENT_SEPARATOR } from './names';

import type { AlNode, XliffTransUnit } from '../../shared/model';

/**
 * Builds the object → member → unit hierarchy from trans-unit ids (MASTER_PLAN §4.5, §7.4).
 *
 * **The tree comes from the id, never from the note** (`DEC-003`). The hash in each
 * segment is stable, unique and language-independent; names are display text that may be
 * missing, ambiguous, or contain the ` - ` separator itself.
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
 * Takes **units rather than a document** so the caller chooses the scope: `DEC-020` makes
 * the DTO per-`<file>`, and XLIFF scopes ids to their `<file>`, so a document-wide tree
 * would merge two files' hierarchies and let identical ids collide.
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

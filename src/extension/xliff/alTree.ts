import { alNameHash } from './alNameHash';
import { generatorNote, namesFromNote } from './names';
import { canonicalHash, canonicalSegment, parseUnitId } from './unitId';
import { SEGMENT_SEPARATOR } from '../../shared/unitPath';

import type { UnitIdSegment } from './unitId';
import type { AlNode, XliffTransUnit } from '../../shared/model';

/**
 * Builds the object → member → unit hierarchy from trans-unit ids.
 *
 * **The tree comes from the id, never from the note.** The hash in each segment is stable,
 * unique and language-independent; names are display text that may be missing, ambiguous,
 * or contain the ` - ` separator itself.
 */

/** The segment type AL puts in front of an object's path when it names the object's namespace. */
export const NAMESPACE_TYPE = 'Namespace';

interface MutableAlNode {
    key: string;
    segment: { type: string; hash: string; name?: string };
    readonly depth: number;
    readonly children: MutableAlNode[];
    unitId?: string;
    /** Whether `segment.name` was confirmed by the segment's hash. */
    verified?: boolean;
}

const DIGITS = /^\d+$/;

/**
 * Groups units into a tree.
 *
 * Takes **units rather than a document** so the caller chooses the scope: the DTO is
 * per-`<file>`, and XLIFF scopes ids to their `<file>`, so a document-wide tree would
 * merge two files' hierarchies and let identical ids collide.
 *
 * Nodes merge on the **canonical path** — every segment as `<Type> <hash>` — so the readable
 * and the hashed form of one symbol are one node. A container is keyed by that path; a node
 * that carries a unit is keyed by the unit's own id, so a node carries a unit exactly when
 * its key is that unit's id. A second unit on the same canonical path gets its own leaf
 * beside the first rather than disappearing.
 *
 * One pass, O(units × depth). Children keep first-appearance order — file order is
 * meaningful and is never re-sorted here.
 */
export function buildAlTree(units: Iterable<XliffTransUnit>): AlNode[] {
    const roots: MutableAlNode[] = [];
    const byPath = new Map<string, MutableAlNode>();
    const byKey = new Set<string>();

    for (const unit of units) {
        const segments = parseUnitId(unit.id);
        const noteNames = namesFromNote(unit.id, generatorNote(unit));

        let path = '';
        let siblings = roots;
        let parentSiblings = roots;
        let node: MutableAlNode | undefined;

        for (let depth = 0; depth < segments.length; depth++) {
            const segment = segments[depth];
            path = depth === 0 ? canonicalSegment(segment) : path + SEGMENT_SEPARATOR + canonicalSegment(segment);

            node = byPath.get(path);
            if (node === undefined) {
                node = { key: path, segment: { type: segment.type, hash: canonicalHash(segment) }, depth, children: [] };
                byPath.set(path, node);
                byKey.add(path);
                siblings.push(node);
            }

            nameNode(node, segment, noteNames?.[depth]);
            parentSiblings = siblings;
            siblings = node.children;
        }

        if (node === undefined) {
            continue;
        }
        if (node.unitId === undefined) {
            byKey.delete(node.key);
            node.key = unit.id;
            node.unitId = unit.id;
            byKey.add(unit.id);
        } else if (node.unitId !== unit.id && !byKey.has(unit.id)) {
            parentSiblings.push({ key: unit.id, segment: { ...node.segment }, depth: node.depth, children: [], unitId: unit.id });
            byKey.add(unit.id);
        }
    }

    return roots.map(freeze);
}

/**
 * Names a node, preferring what is certain.
 *
 * A readable id names its segment outright — unless the name is all digits, which is how
 * an API procedure's caption id carries the procedure's number, so its note's name wins. A
 * note's name is taken only once its hash matches the segment; one that does not match is a
 * fallback until a unit supplies one that does. That keeps a folded extension, whose note
 * names the extension while its id names the object it extends, from naming the wrong one.
 */
function nameNode(node: MutableAlNode, segment: UnitIdSegment, noteName: string | undefined): void {
    if (node.verified === true) {
        return;
    }

    if (segment.name !== undefined && !DIGITS.test(segment.name)) {
        node.segment = { ...node.segment, name: segment.name };
        node.verified = true;
        return;
    }

    if (noteName === undefined) {
        return;
    }
    if (alNameHash(noteName) === node.segment.hash) {
        node.segment = { ...node.segment, name: noteName };
        node.verified = true;
    } else if (node.segment.name === undefined) {
        node.segment = { ...node.segment, name: noteName };
    }
}

function freeze(node: MutableAlNode): AlNode {
    return {
        key: node.key,
        segment: node.segment,
        depth: node.depth,
        children: node.children.map(freeze),
        ...(node.unitId === undefined ? {} : { unitId: node.unitId }),
    };
}

/**
 * The prefix of a group key.
 *
 * A container's key is a canonical path of `<Type> <hash>` segments and a unit's key is its
 * id, and neither can begin with a lowercase word and a colon — so no group key can equal a
 * node's key: a node carries a unit exactly when its key **is** that unit's id, and a group
 * carries none.
 */
export const OBJECT_TYPE_GROUP_PREFIX = 'type:';

/** The key of the group holding the objects that have no namespace, in a file where others do. */
export const NO_NAMESPACE_GROUP_KEY = 'namespace:';

/** True for a root that names a namespace rather than an object. */
export function isNamespaceNode(node: AlNode): boolean {
    return node.segment.type === NAMESPACE_TYPE && node.segment.hash !== '';
}

/**
 * Adds the levels above the objects.
 *
 * Every object is wrapped in a group of its type — `Tables (12)` — because a file's objects
 * are otherwise one flat list in file order. When the ids name namespaces, the namespaces
 * come first, each with type groups of its own, and the objects without a namespace gather
 * under one "(no namespace)" group.
 *
 * A root whose id did not parse as `<SymbolType> <value>` has no type to group by and stays
 * where it is, in file order beside the groups.
 */
export function groupRoots(roots: readonly AlNode[]): AlNode[] {
    if (!roots.some(isNamespaceNode)) {
        return groupByType(roots, OBJECT_TYPE_GROUP_PREFIX);
    }

    const order: (AlNode | typeof NO_NAMESPACE_GROUP_KEY)[] = [];
    const withoutNamespace: AlNode[] = [];

    for (const root of roots) {
        if (isNamespaceNode(root)) {
            order.push({ ...root, children: groupByType(root.children, `${OBJECT_TYPE_GROUP_PREFIX}${root.key}/`) });
        } else if (root.segment.hash === '') {
            order.push(root);
        } else {
            if (withoutNamespace.length === 0) {
                order.push(NO_NAMESPACE_GROUP_KEY);
            }
            withoutNamespace.push(root);
        }
    }

    return order.map(entry => (entry === NO_NAMESPACE_GROUP_KEY
        ? {
            key: NO_NAMESPACE_GROUP_KEY,
            segment: { type: NAMESPACE_TYPE, hash: '', name: '(no namespace)' },
            depth: 0,
            children: groupByType(withoutNamespace, `${OBJECT_TYPE_GROUP_PREFIX}${NO_NAMESPACE_GROUP_KEY}/`),
            synthetic: true,
        }
        : entry));
}

/** One synthetic node per object type, in first-appearance order. */
function groupByType(nodes: readonly AlNode[], keyPrefix: string): AlNode[] {
    const order: (AlNode | string)[] = [];
    const groups = new Map<string, { readonly type: string; readonly members: AlNode[] }>();

    for (const node of nodes) {
        if (node.segment.hash === '') {
            order.push(node);
            continue;
        }

        const key = keyPrefix + node.segment.type;
        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, { type: node.segment.type, members: [node] });
            order.push(key);
        } else {
            group.members.push(node);
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
            synthetic: true,
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

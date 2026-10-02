import { alNameHash } from './alNameHash';
import { generatorNote, readGeneratorNote } from './names';
import { canonicalHash, canonicalSegment, parseUnitId, readableName } from './unitId';
import { NAMESPACE_TYPE, SEGMENT_SEPARATOR } from '../../shared/unitPath';

import type { GeneratorNoteReading } from './names';
import type { UnitIdSegment } from './unitId';
import type { AlNode, XliffTransUnit } from '../../shared/model';

/**
 * Builds the object → member → unit hierarchy from trans-unit ids.
 *
 * **The tree comes from the id, never from the note.** The hash in each segment is stable,
 * unique and language-independent; names are display text that may be missing, ambiguous,
 * or contain the ` - ` separator itself.
 */

interface MutableAlNode {
    key: string;
    segment: { type: string; hash: string; name?: string };
    readonly depth: number;
    readonly children: MutableAlNode[];
    unitId?: string;
    /** Whether `segment.name` was confirmed by the segment's hash. */
    verified?: boolean;
}

/**
 * Groups one `<file>`'s units into a tree; XLIFF scopes ids to their `<file>`.
 *
 * Nodes merge on the **canonical path** — every segment as `<Type> <hash>` — so the readable
 * and the hashed form of one symbol are one node. A container is keyed by that path; a node
 * that carries a unit is keyed by the unit's own id. A second unit on the same canonical
 * path gets a leaf of its own beside the first.
 *
 * One pass, O(units × depth). Children keep the order they first appear in.
 */
export function buildAlTree(units: Iterable<XliffTransUnit>): AlNode[] {
    const roots: MutableAlNode[] = [];
    const byPath = new Map<string, MutableAlNode>();
    const byKey = new Set<string>();

    for (const unit of units) {
        const segments = parseUnitId(unit.id);
        const noteNames = namesByDepth(segments, readGeneratorNote(segments, generatorNote(unit)));

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

            nameNode(node, segment, noteNames.at(depth));
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
 * The note's name for each of the id's segments, by depth.
 *
 * The root's is left out when the note's object is of another type: a folded extension's
 * note names the extension, not the object its id is filed under.
 */
function namesByDepth(segments: readonly UnitIdSegment[], reading: GeneratorNoteReading | undefined): readonly (string | undefined)[] {
    if (reading === undefined) {
        return [];
    }
    const namespaced = segments.at(0)?.type === NAMESPACE_TYPE;
    const root = segments.at(namespaced ? 1 : 0);
    return [
        ...(namespaced ? [reading.declaring.namespace] : []),
        root?.type === reading.declaring.type ? reading.declaring.name : undefined,
        ...reading.names,
    ];
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

    const readable = readableName(segment);
    if (readable !== undefined) {
        node.segment = { ...node.segment, name: readable };
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
 * id, read from an XML attribute — and no XML 1.0 document can carry the control character
 * U+001F, which every group key starts with. So no group key can equal a node's key: a node
 * carries a unit exactly when its key **is** that unit's id, and a group carries none.
 */
export const OBJECT_TYPE_GROUP_PREFIX = '\u001ftype:';

/** The key of the group holding the objects that have no namespace, in a file where others do. */
export const NO_NAMESPACE_GROUP_KEY = '\u001fnamespace:';

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

/** An object-type group while its members are still being collected. */
interface TypeGroup {
    readonly key: string;
    readonly type: string;
    readonly members: AlNode[];
}

/** One synthetic node per object type, in first-appearance order. */
function groupByType(nodes: readonly AlNode[], keyPrefix: string): AlNode[] {
    const order: (AlNode | TypeGroup)[] = [];
    const groups = new Map<string, TypeGroup>();

    for (const node of nodes) {
        if (node.segment.hash === '') {
            order.push(node);
            continue;
        }

        const key = keyPrefix + node.segment.type;
        const group = groups.get(key);
        if (group === undefined) {
            const created: TypeGroup = { key, type: node.segment.type, members: [node] };
            groups.set(key, created);
            order.push(created);
        } else {
            group.members.push(node);
        }
    }

    return order.map((entry): AlNode => ('members' in entry
        ? {
            key: entry.key,
            // Counts objects; the progress bar beside it counts units.
            segment: { type: entry.type, hash: '', name: `${entry.type}s (${entry.members.length})` },
            depth: 0,
            children: entry.members,
            synthetic: true,
        }
        : entry));
}

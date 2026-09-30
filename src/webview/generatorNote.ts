import { SEGMENT_SEPARATOR } from '@shared/unitPath';

import type { AlNodeDto } from '@shared/dto';

/** A node of the tree, with the real node above it — the levels the tree adds are skipped. */
export interface IndexedNode {
    readonly node: AlNodeDto;
    readonly parent?: IndexedNode;
}

/** Every node of a tree by key, each knowing its parent. */
export type NodeIndex = ReadonlyMap<string, IndexedNode>;

/**
 * Rebuilds the `Xliff Generator` note the payload does not carry.
 *
 * The payload drops it because its whole content is the symbol path, and the names in that
 * path are already on the tree nodes. `xliffViewer.showGeneratorNotes` reconstructs it
 * instead — walking from the unit's node up to its object, each node's type beside its name:
 *
 * ```text
 * nodes  Table / Sales Setup  ›  Field / Quote Nos.  ›  Property / Caption
 * note   Table Sales Setup - Field Quote Nos. - Property Caption
 * ```
 *
 * A namespace is a node like any other, so a namespaced unit's note starts with it, as the
 * compiler writes it. Exact for every unit whose names are known — except one the compiler
 * files under another object than the one that declares it, an extension's element filed
 * under the object it extends: the file's note names the extension, this one the object.
 * Returns `undefined` rather than guessing where a name is missing — the caller shows the
 * raw id instead.
 */
export function reconstructGeneratorNote(unitId: string, index: NodeIndex): string | undefined {
    const parts: string[] = [];

    for (let entry = index.get(unitId); entry !== undefined; entry = entry.parent) {
        if (entry.node.name === undefined) {
            return undefined;
        }
        parts.push(`${entry.node.type} ${entry.node.name}`);
    }

    return parts.length === 0 ? undefined : parts.reverse().join(SEGMENT_SEPARATOR);
}

/** Every node of a tree, indexed by key — what the reconstruction walks. */
export function indexNodes(nodes: readonly AlNodeDto[], parent?: IndexedNode, into = new Map<string, IndexedNode>()): Map<string, IndexedNode> {
    for (const node of nodes) {
        // A group is a level the tree adds, not a segment of any id: its children keep the
        // parent the group itself has.
        const entry: IndexedNode | undefined = node.group === true ? parent : { node, parent };
        if (entry?.node === node) {
            into.set(node.key, entry);
        }
        indexNodes(node.children, entry, into);
    }
    return into;
}

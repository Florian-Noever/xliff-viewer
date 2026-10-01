import type { AlNode } from '../../shared/model';

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

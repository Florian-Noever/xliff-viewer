import type { AlNodeDto } from '@shared/dto';

const SEGMENT_SEPARATOR = ' - ';

/**
 * Rebuilds the `Xliff Generator` note the payload does not carry.
 *
 * The payload drops it because its whole content is the symbol path, and the names in that
 * path are already on the tree nodes. `xliffViewer.showGeneratorNotes` reconstructs it
 * instead — the segment **types** from the id interleaved with the **names** from the nodes:
 *
 * ```text
 * id     Table 3783554337 - Field 4264183382 - Property 2879900210
 * nodes  Table / Sales Setup, Field / Quote Nos., Property / Caption
 * note   Table Sales Setup - Field Quote Nos. - Property Caption
 * ```
 *
 * Exact for every unit whose names parsed. Returns `undefined` for the rest rather than
 * guessing — the caller shows the raw id instead.
 */
export function reconstructGeneratorNote(unitId: string, nodesByKey: ReadonlyMap<string, AlNodeDto>): string | undefined {
    const segments = unitId.split(SEGMENT_SEPARATOR);
    const parts: string[] = [];
    let key = '';

    for (const segment of segments) {
        key = key === '' ? segment : key + SEGMENT_SEPARATOR + segment;
        const node = nodesByKey.get(key);
        if (node?.name === undefined) {
            return undefined;
        }
        parts.push(`${node.type} ${node.name}`);
    }

    return parts.join(SEGMENT_SEPARATOR);
}

/** Every node of a tree, indexed by key — what the reconstruction walks. */
export function indexNodes(nodes: readonly AlNodeDto[], into = new Map<string, AlNodeDto>()): Map<string, AlNodeDto> {
    for (const node of nodes) {
        into.set(node.key, node);
        indexNodes(node.children, into);
    }
    return into;
}

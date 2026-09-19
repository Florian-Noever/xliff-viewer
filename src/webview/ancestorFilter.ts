import type { AlNodeDto } from '@shared/dto';

/**
 * The one ancestor rule, shared by search and by the state filter.
 *
 * "A matching leaf forces its ancestors visible" is easy to write twice and get subtly
 * different twice, so it is written once and both callers hand it a predicate.
 *
 * Predicates compose with **and**, at the node rather than at the result: a unit is shown
 * when it satisfies every active filter. Intersecting two finished visible-sets instead
 * would keep a container that matched the search while none of its units matched the
 * state — visible, and empty, for no reason a user could see.
 */

export type NodePredicate = (node: AlNodeDto) => boolean;

export interface FilterResult {
    /** Keys to render: the matches, and every ancestor on the way to one. */
    readonly visible: ReadonlySet<string>;
    /** How many nodes matched in their own right, which is what a count means to a reader. */
    readonly count: number;
}

/**
 * Returns `undefined` when nothing is filtering — which is not the same as an empty
 * result, and is how the tree tells "show everything" from "nothing matched".
 */
export function visibleNodes(nodes: readonly AlNodeDto[], predicates: readonly NodePredicate[]): FilterResult | undefined {
    if (predicates.length === 0) {
        return undefined;
    }

    const visible = new Set<string>();
    let count = 0;

    const walk = (node: AlNodeDto): boolean => {
        let descendantMatched = false;
        for (const child of node.children) {
            descendantMatched = walk(child) || descendantMatched;
        }

        const selfMatched = predicates.every(matches => matches(node));
        if (selfMatched) {
            count++;
        }
        if (selfMatched || descendantMatched) {
            visible.add(node.key);
            return true;
        }
        return false;
    };

    for (const node of nodes) {
        walk(node);
    }

    return { visible, count };
}

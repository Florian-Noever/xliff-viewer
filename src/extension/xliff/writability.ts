import { attributesOf, childrenOf, tagOf, TEXT_KEY } from './fxpTree';

import type { FxpNode } from './fxpTree';

/**
 * What a document may hold for the model to write it back as it was read. The serialiser
 * writes every element it knows in this order, so a child that comes earlier in the list
 * after a later one would move on the first save.
 */
const CHILDREN: Readonly<Record<string, readonly string[]>> = {
    xliff: ['file'],
    file: ['body'],
    body: ['trans-unit', 'group'],
    group: ['trans-unit', 'group'],
    'trans-unit': ['source', 'target', 'note'],
};

/** Elements the model keeps as text alone. */
const LEAVES = new Set(['source', 'target', 'note']);

/**
 * The first thing in a document that writing it back would lose or move, as a phrase that
 * fits "This file contains …", or undefined when an edit would change nothing else.
 *
 * Formatting does not count: a document laid out differently from AL is rewritten in AL's
 * layout, but keeps every element, attribute and character of text. A false positive only
 * makes a document read-only, which is the direction to err in.
 */
export function unsupportedConstruct(body: string, declaration: string, root: FxpNode): string | undefined {
    return unsupportedMarkup(body, declaration) ?? unsupportedElement(root);
}

/** What the parser drops before there is a tree to walk. */
function unsupportedMarkup(body: string, declaration: string): string | undefined {
    if (body.includes('<!--')) {
        return 'XML comments';
    }
    if (body.includes('<![CDATA[')) {
        return 'a CDATA section';
    }
    if (body.includes('<?', declaration.length)) {
        return 'a processing instruction';
    }
    if (body.includes('<!DOCTYPE')) {
        return 'a DOCTYPE';
    }
    return undefined;
}

function unsupportedElement(node: FxpNode): string | undefined {
    const tag = tagOf(node) ?? '';
    if (LEAVES.has(tag)) {
        return unsupportedLeaf(tag, node);
    }

    const allowed = CHILDREN[tag] ?? [];
    let latest = 0;
    for (const child of childrenOf(node)) {
        const childTag = tagOf(child) ?? '';
        if (childTag === TEXT_KEY) {
            if (String(child[TEXT_KEY]).trim() !== '') {
                return 'text outside the elements it belongs to';
            }
            continue;
        }

        const rank = allowed.indexOf(childTag);
        if (rank < 0) {
            return `a \`<${childTag}>\` element`;
        }
        if (rank < latest) {
            return `a \`<${childTag}>\` after a \`<${allowed[latest]}>\``;
        }
        latest = rank;

        const inside = unsupportedElement(child);
        if (inside !== undefined) {
            return inside;
        }
    }
    return undefined;
}

/** `<source>` is written without attributes, and none of the three keeps child elements. */
function unsupportedLeaf(tag: string, node: FxpNode): string | undefined {
    if (tag === 'source' && Object.keys(attributesOf(node)).length > 0) {
        return 'an attribute on `<source>`';
    }
    const inline = childrenOf(node).map(child => tagOf(child)).find(childTag => childTag !== TEXT_KEY);
    return inline === undefined ? undefined : `inline markup such as \`<${inline}>\``;
}

import { encodeText, renderAttributes } from './serialise';

import type { XliffAttributes } from '../../shared/model';

/** Under `preserveOrder`, fast-xml-parser puts an element's attributes here. */
const ATTRIBUTES_KEY = ':@';
export const TEXT_KEY = '#text';

/** One node of fast-xml-parser's `preserveOrder` output: a single tag key, plus `:@`. */
export interface FxpNode {
    readonly [key: string]: unknown;
}

export function tagOf(node: FxpNode): string | undefined {
    return Object.keys(node).find(key => key !== ATTRIBUTES_KEY);
}

export function attributesOf(node: FxpNode): XliffAttributes {
    const raw = node[ATTRIBUTES_KEY];
    if (raw === undefined || raw === null || typeof raw !== 'object') {
        return {};
    }
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
        result[name] = String(value);
    }
    return result;
}

export function childrenOf(node: FxpNode): FxpNode[] {
    const tag = tagOf(node);
    const value = tag === undefined ? undefined : node[tag];
    return Array.isArray(value) ? (value as FxpNode[]) : [];
}

/** Child elements with the given tag, skipping whitespace text nodes. */
export function elementsNamed(node: FxpNode, tag: string): FxpNode[] {
    return childrenOf(node).filter(child => tagOf(child) === tag);
}

/**
 * Concatenated text of a leaf element. An empty element parses to `[]` rather than a
 * `#text` node, which is how `<source/>` and `<target …/>` arrive.
 *
 * Inline markup such as `<x/>` is kept as the XML it was written as, so the reader sees it.
 * A document holding any is read-only, so this text is never written back.
 */
export function textOf(node: FxpNode): string {
    return childrenOf(node).map(child => textPart(child, false)).join('');
}

function textPart(node: FxpNode, insideMarkup: boolean): string {
    const value = node[TEXT_KEY];
    if (typeof value === 'string') {
        return insideMarkup ? encodeText(value) : value;
    }
    const tag = tagOf(node);
    if (tag === undefined) {
        return '';
    }
    const open = `<${tag}${renderAttributes(attributesOf(node))}`;
    const children = childrenOf(node);
    return children.length === 0
        ? `${open}/>`
        : `${open}>${children.map(child => textPart(child, true)).join('')}</${tag}>`;
}

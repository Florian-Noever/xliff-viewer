import { canonicalPropertyName, declaresMember, extendedKeyword, extensionKeywords, isTransparent, objectKeyword } from './alSymbolKinds';
import { alNameHash } from '../xliff/alNameHash';

import type { IndexedObject } from './alHeaderIndex';
import type { AlDeclaration, AlObject, AlOutline, AlRange } from './alOutline';
import type { TargetSegment, UnitTarget } from './alTarget';

/**
 * Where in the AL source a unit is declared.
 *
 * Candidates come in tiers: the object the note names (the declaring one, even when the id
 * files the element under another), the id's own root, what `al-object-target` points at,
 * and the root's sibling extensions. In each, the id's remaining segments are walked through
 * the object's outline — members by descending through sections and groups, methods and the
 * translated element as direct children, overloads tried in turn. The best result wins:
 * the translated element itself, else the deepest declaration reached, else the object.
 */

export const LocatePrecision = {
    exact: 'exact',
    member: 'member',
    object: 'object',
} as const;
export type LocatePrecision = typeof LocatePrecision[keyof typeof LocatePrecision];

export interface UnitLocation {
    readonly file: string;
    /** The declaring token: the property's or label's name, the member's, or the object's. */
    readonly range: AlRange;
    readonly precision: LocatePrecision;
    /** Which candidate tier found it; lower is more certain. */
    readonly tier: number;
}

export type LocateResult =
    | { readonly kind: 'found'; readonly location: UnitLocation }
    | { readonly kind: 'ambiguous'; readonly locations: readonly UnitLocation[] }
    | { readonly kind: 'notFound' };

export interface Candidate {
    readonly object: IndexedObject;
    readonly tier: number;
}

const RANK: Readonly<Record<LocatePrecision, number>> = { exact: 3, member: 2, object: 1 };

/** A declared name that hashes to the segment's — what the compiler itself wrote. */
function hashed(declared: string, segment: TargetSegment): boolean {
    return alNameHash(declared) === segment.hash;
}

/** A declared name matches a segment by its hash, or by the name the id or note gives, in any case. */
function named(declared: string, segment: TargetSegment): boolean {
    return hashed(declared, segment) || segment.name?.toLowerCase() === declared.toLowerCase();
}

/** Declarations whose name hashes to the segment's first, then those that only match it by name — each in source order. */
function hashFirst(declarations: readonly AlDeclaration[], segment: TargetSegment): AlDeclaration[] {
    const byHash = (each: AlDeclaration): boolean => each.name !== undefined && hashed(each.name.text, segment);
    return [...declarations.filter(byHash), ...declarations.filter(each => !byHash(each))];
}

/** Of objects with one name, those without a namespace, when there are any. */
function preferGlobal(objects: readonly IndexedObject[]): readonly IndexedObject[] {
    const global = objects.filter(object => object.namespace === undefined);
    return global.length > 0 ? global : objects;
}

function namedObject(object: IndexedObject, segment: TargetSegment): boolean {
    return object.nameHash === segment.hash || segment.name?.toLowerCase() === object.name.toLowerCase();
}

/** The objects a unit may be declared in, most certain first, each once. */
export function candidateObjects(target: UnitTarget, index: readonly IndexedObject[]): Candidate[] {
    const candidates: Candidate[] = [];
    const add = (tier: number, objects: readonly IndexedObject[]): void => {
        for (const object of objects) {
            if (!candidates.some(each => each.object === object)) {
                candidates.push({ object, tier });
            }
        }
    };

    const rootKind = objectKeyword(target.root.type);
    const declaring = target.declaring;
    if (declaring !== undefined) {
        const byName = index.filter(object => object.kind === objectKeyword(declaring.type) && object.name.toLowerCase() === declaring.name.toLowerCase());
        const declaringNamespace = declaring.namespace?.toLowerCase();
        add(1, declaringNamespace !== undefined
            ? byName.filter(object => object.namespace?.toLowerCase() === declaringNamespace)
            // A namespaced app's note names every namespace, so a note without one names a global object.
            : target.readable ? preferGlobal(byName) : byName);
    }

    const roots = index.filter(object => object.kind === rootKind && namedObject(object, target.root));
    const namespace = target.namespace;
    const inNamespace = namespace === undefined
        // A readable id without a namespace segment belongs to an object without a namespace.
        ? (target.readable ? roots.filter(object => object.namespace === undefined) : roots)
        : roots.filter(object => object.namespaceHash === namespace.hash
            || (namespace.name !== undefined && object.namespace?.toLowerCase() === namespace.name.toLowerCase()));
    add(2, inNamespace.length > 0 || namespace !== undefined ? inNamespace : roots);

    const objectTarget = target.objectTarget;
    if (objectTarget !== undefined) {
        const targetKind = objectKeyword(objectTarget.type);
        if (extendedKeyword(targetKind) === undefined) {
            // A base object stands for its extensions. AL matches names in any case, so an
            // `extends` spelt differently from the declaration still names the object.
            const extensions = extensionKeywords(targetKind);
            const declared = new Set(index.filter(object => object.kind === targetKind && object.nameHash === objectTarget.hash).map(object => object.name.toLowerCase()));
            add(3, index.filter(object => extensions.includes(object.kind)
                && (object.targetHash === objectTarget.hash || (object.target !== undefined && declared.has(object.target.toLowerCase())))));
        } else {
            add(3, index.filter(object => object.kind === targetKind && object.nameHash === objectTarget.hash));
        }
    }

    if (extendedKeyword(rootKind) !== undefined) {
        const rootTargets = new Set(roots.flatMap(object => (object.target === undefined ? [] : [object.target.toLowerCase()])));
        add(4, index.filter(object => object.kind === rootKind && object.target !== undefined && rootTargets.has(object.target.toLowerCase())));
    }

    return candidates;
}

interface Reached {
    readonly range: AlRange;
    readonly depth: number;
    readonly declaration: AlDeclaration;
}

/**
 * Walks a unit's path through one object, returning the deepest point reached — the whole
 * path when `depth` equals its length.
 */
function walkObject(object: AlObject, path: readonly TargetSegment[]): Reached {
    const start: Reached = { range: object.name?.range ?? object.range, depth: 0, declaration: object };
    return walk(object, path, 0, start);
}

function deeper(best: Reached, candidate: Reached | undefined): Reached {
    return candidate !== undefined && candidate.depth > best.depth ? candidate : best;
}

function walk(container: AlDeclaration, path: readonly TargetSegment[], index: number, reached: Reached): Reached {
    const segment = path.at(index);
    if (segment === undefined) {
        return reached;
    }
    const at = (range: AlRange, declaration: AlDeclaration): Reached => ({ range, depth: index + 1, declaration });

    switch (segment.type) {
        case 'Property': {
            const property = container.properties.find((each) => {
                const canonical = canonicalPropertyName(each.name.text);
                return (canonical !== undefined && named(canonical, segment)) || named(each.name.text, segment);
            });
            return property === undefined ? reached : at(property.name.range, container);
        }
        case 'NamedType': {
            const variable = container.variables.find(each => (each.type === 'label' || each.type === 'textconst') && named(each.name.text, segment));
            return variable === undefined ? reached : at(variable.name.range, container);
        }
        case 'ReportLabel': {
            const label = container.children.filter(child => child.keyword === 'labels')
                .flatMap(section => section.properties)
                .find(each => named(each.name.text, segment));
            return label === undefined ? reached : at(label.name.range, container);
        }
        case 'RequestPage':
        case 'RequestPageExtension': {
            const page = container.children.find(child => child.keyword === 'requestpage');
            if (page === undefined) {
                return reached;
            }
            // Its keyword stands for the request page, rather than the whole block it opens.
            return walk(page, path, index + 1, at({ start: page.range.start, end: page.range.start + page.keyword.length }, page));
        }
        case 'Method': {
            let best = reached;
            const methods = hashFirst(container.children.filter(child => child.kind === 'method' && child.name !== undefined && named(child.name.text, segment)), segment);
            // A trigger of the request page is filed under its report.
            const fallback = methods.length === 0
                ? container.children.filter(child => child.keyword === 'requestpage').flatMap(page => page.children)
                    .filter(child => child.kind === 'method' && child.name !== undefined && named(child.name.text, segment))
                : [];
            for (const method of [...methods, ...fallback]) {
                const result = walk(method, path, index + 1, at(method.name?.range ?? method.range, method));
                if (result.depth === path.length) {
                    return result;
                }
                best = deeper(best, result);
            }
            return best;
        }
        default: {
            let best = reached;
            for (const member of hashFirst(membersOf(container, segment), segment)) {
                const result = walk(member, path, index + 1, at(member.name?.range ?? member.range, member));
                if (result.depth === path.length) {
                    return result;
                }
                best = deeper(best, result);
            }
            return best;
        }
    }
}

/** The members below a container that declare the segment, in source order — through sections and groups, never into methods. */
function membersOf(container: AlDeclaration, segment: TargetSegment): AlDeclaration[] {
    const found: AlDeclaration[] = [];
    const visit = (declaration: AlDeclaration): void => {
        for (const child of declaration.children) {
            if (child.kind === 'method') {
                continue;
            }
            if (child.kind === 'member' && !isTransparent(child) && child.name !== undefined
                && declaresMember(child, segment.type) && named(child.name.text, segment)) {
                found.push(child);
            }
            visit(child);
        }
    };
    visit(container);
    return found;
}

/** The object in an outline that an index entry stands for. */
function objectIn(outline: AlOutline, entry: IndexedObject): AlObject | undefined {
    return outline.objects.find(object => object.keyword === entry.kind
        && object.name?.text.toLowerCase() === entry.name.toLowerCase()
        && (entry.id === undefined || object.id === entry.id));
}

/**
 * Locates a unit among the candidate objects, whose files' outlines the caller supplies —
 * read fresh, so an edited file is seen as it is now.
 */
export function locateUnit(target: UnitTarget, candidates: readonly Candidate[], outlines: ReadonlyMap<string, AlOutline>): LocateResult {
    const locations: UnitLocation[] = [];

    for (const { object: entry, tier } of candidates) {
        const outline = outlines.get(entry.file);
        const object = outline === undefined ? undefined : objectIn(outline, entry);
        if (object === undefined) {
            continue;
        }
        const reached = walkObject(object, target.path);
        const precision = reached.depth === target.path.length
            ? LocatePrecision.exact
            : reached.declaration === object ? LocatePrecision.object : LocatePrecision.member;
        locations.push({ file: entry.file, range: reached.range, precision, tier });
    }

    if (locations.length === 0) {
        return { kind: 'notFound' };
    }
    const best = locations.reduce((winner, each) => (
        RANK[each.precision] > RANK[winner.precision] || (RANK[each.precision] === RANK[winner.precision] && each.tier < winner.tier) ? each : winner
    ));
    const ties = locations.filter(each => RANK[each.precision] === RANK[best.precision] && each.tier === best.tier
        && !(each.file === best.file && each.range.start === best.range.start));
    return ties.length === 0 ? { kind: 'found', location: best } : { kind: 'ambiguous', locations: [best, ...ties] };
}

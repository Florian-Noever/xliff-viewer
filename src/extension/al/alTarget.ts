import { alNameHash } from '../xliff/alNameHash';
import { readGeneratorNote } from '../xliff/names';
import { canonicalHash, parseUnitId, readableName } from '../xliff/unitId';
import { NAMESPACE_TYPE } from '../../shared/unitPath';

/**
 * What a trans-unit asks the AL source for.
 *
 * The id says which symbols, by type and hash; a readable id and the generator note add
 * their names. The note always names the object that **declares** the element, which the id
 * does not when the compiler files an extension's element under another object — so the
 * note's root is kept apart from the id's.
 */

export interface TargetSegment {
    readonly type: string;
    /** The hash the id carries, or the one AL writes for its readable name. */
    readonly hash: string;
    /** The symbol's name, when the id or the note gives one. */
    readonly name?: string;
}

export interface DeclaringObject {
    readonly type: string;
    readonly name: string;
    readonly namespace?: string;
}

export interface UnitTarget {
    readonly namespace?: TargetSegment;
    readonly root: TargetSegment;
    /** Everything after the root: members, methods and the translated element itself. */
    readonly path: readonly TargetSegment[];
    /** The object the note names — the declaring one. */
    readonly declaring?: DeclaringObject;
    /** `al-object-target`, which is always hashed. */
    readonly objectTarget?: { readonly type: string; readonly hash: string };
    /** Whether the id is written with names — the compiler's namespace feature. */
    readonly readable: boolean;
}

/**
 * Reads a unit's id, generator note and `al-object-target` into what to look for, or
 * undefined for an id that carries no AL structure.
 */
export function unitTarget(id: string, generatorNote?: string, alObjectTarget?: string): UnitTarget | undefined {
    const segments = parseUnitId(id);
    if (segments.some(segment => segment.type === '' || segment.value === '')) {
        return undefined;
    }

    const namespaceSegment = segments[0].type === NAMESPACE_TYPE ? segments[0] : undefined;
    const [rootSegment, ...rest] = namespaceSegment === undefined ? segments : segments.slice(1);
    if (rootSegment === undefined) {
        return undefined;
    }

    const note = readGeneratorNote(segments, generatorNote);

    const namespace = namespaceSegment === undefined ? undefined : {
        type: NAMESPACE_TYPE,
        hash: canonicalHash(namespaceSegment),
        name: namespaceSegment.name ?? verified(note?.declaring.namespace, canonicalHash(namespaceSegment)),
    };
    const rootHash = canonicalHash(rootSegment);
    const root = {
        type: rootSegment.type,
        hash: rootHash,
        name: readableName(rootSegment) ?? (note?.declaring.type === rootSegment.type ? verified(note.declaring.name, rootHash) : undefined),
    };
    const path = rest.map((segment, index) => ({
        type: segment.type,
        hash: canonicalHash(segment),
        name: readableName(segment) ?? note?.names.at(index),
    }));

    const objectTarget = /^(\S+) (-?\d+)$/.exec(alObjectTarget ?? '');
    return {
        ...(namespace === undefined ? {} : { namespace }),
        root,
        path,
        ...(note === undefined ? {} : { declaring: note.declaring }),
        ...(objectTarget === null ? {} : { objectTarget: { type: objectTarget[1], hash: objectTarget[2] } }),
        readable: segments.some(segment => segment.name !== undefined),
    };
}

/** A name, if its hash is the one the id carries. */
function verified(name: string | undefined, hash: string): string | undefined {
    return name !== undefined && alNameHash(name) === hash ? name : undefined;
}

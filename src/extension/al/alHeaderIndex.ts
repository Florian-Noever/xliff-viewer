import { alNameHash } from '../xliff/alNameHash';

import type { AlOutline } from './alOutline';

/**
 * The objects a set of AL files declares, by kind, name and namespace — what decides which
 * files a unit may be declared in, before any of them is read in full.
 */

export interface IndexedObject {
    /** The file, as the caller names it. */
    readonly file: string;
    /** The object keyword, lowercased: `table`, `pageextension`, … */
    readonly kind: string;
    readonly id?: number;
    readonly name: string;
    readonly nameHash: string;
    readonly namespace?: string;
    readonly namespaceHash?: string;
    /** What an extension extends, without its namespace. */
    readonly target?: string;
    readonly targetHash?: string;
}

/** The objects one file declares, from its outline or its header scan. */
export function indexedObjects(file: string, outline: AlOutline): IndexedObject[] {
    return outline.objects.flatMap((object) => {
        if (object.name === undefined) {
            return [];
        }
        return [{
            file,
            kind: object.keyword,
            ...(object.id === undefined ? {} : { id: object.id }),
            name: object.name.text,
            nameHash: alNameHash(object.name.text),
            ...(object.namespace === undefined ? {} : { namespace: object.namespace, namespaceHash: alNameHash(object.namespace) }),
            ...(object.target === undefined ? {} : { target: object.target.text, targetHash: alNameHash(object.target.text) }),
        }];
    });
}

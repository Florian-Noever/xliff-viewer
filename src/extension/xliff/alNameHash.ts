const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 16777619;
const INT32_MAX = 2147483647;

/**
 * The number AL writes into a trans-unit id segment for a name.
 *
 * FNV-1a, 32-bit, over the name's UTF-16LE bytes, read as a signed 32-bit integer and then
 * offset by `int.MaxValue` — so the result runs from -1 to 4294967294. The name is hashed
 * exactly as declared, which makes the hash case-sensitive.
 *
 * ```text
 * alNameHash('Caption') === '2879900210'
 * ```
 */
export function alNameHash(name: string): string {
    let hash = FNV_OFFSET_BASIS | 0;
    for (let index = 0; index < name.length; index++) {
        const codeUnit = name.charCodeAt(index);
        // Each UTF-16 code unit is two bytes, low byte first.
        hash = Math.imul(hash ^ (codeUnit & 0xff), FNV_PRIME);
        hash = Math.imul(hash ^ (codeUnit >>> 8), FNV_PRIME);
    }
    return String(hash + INT32_MAX);
}

/**
 * The `postMessage` contract, defined once and imported by both runtimes (§6.3, DEC-014).
 *
 * This is the seed `HOST-01` grows into the full protocol of §8.3. It carries only what
 * TOOL-05 needs to prove the plumbing end to end; do not build features on it before
 * HOST-01 replaces it.
 *
 * Everything crossing this boundary is an `as const` object, never a TypeScript `enum`
 * (§14.5) — enums are neither JSON-safe nor esbuild-safe across files.
 */

export const ExtensionMessageType = {
    documentInfo: 'documentInfo',
} as const;
export type ExtensionMessageType = typeof ExtensionMessageType[keyof typeof ExtensionMessageType];

export const WebviewMessageType = {
    ready: 'ready',
} as const;
export type WebviewMessageType = typeof WebviewMessageType[keyof typeof WebviewMessageType];

export interface DocumentInfo {
    readonly fileName: string;
    readonly characters: number;
}

/** Extension → webview. Always `{ type, payload }` (§8.3). */
export type ExtensionMessage =
    | { readonly type: typeof ExtensionMessageType.documentInfo; readonly payload: DocumentInfo };

/** Webview → extension. */
export type WebviewMessage =
    | { readonly type: typeof WebviewMessageType.ready };

function hasStringType(value: unknown): value is { type: string } {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { type?: unknown }).type === 'string';
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
    if (!hasStringType(value)) {
        return false;
    }
    return (Object.values(ExtensionMessageType) as string[]).includes(value.type);
}

export function isWebviewMessage(value: unknown): value is WebviewMessage {
    if (!hasStringType(value)) {
        return false;
    }
    return (Object.values(WebviewMessageType) as string[]).includes(value.type);
}

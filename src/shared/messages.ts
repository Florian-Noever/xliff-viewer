/**
 * The `postMessage` contract, defined once and imported by both runtimes. There is nothing
 * to keep in sync: one union per direction, one guard each.
 *
 * Everything crossing this boundary is an `as const` object, never a TypeScript `enum` —
 * enums are neither JSON-safe nor esbuild-safe across files.
 *
 * `patchUnits`, and every message naming a unit, carries the file index: XLIFF scopes a
 * trans-unit id to its `<file>`, so an id alone does not identify a unit.
 *
 * `settings` is a message of its own: folding the settings into `setDocument` would mean
 * re-sending the whole document to toggle a checkbox.
 */

import type { TransUnitDto, XliffDocumentDto, BaseFileDto } from './dto';
import type { WebviewSettings } from './settings';
import type { XliffState } from './state';

// ── Extension → webview ──────────────────────────────────────────────────────

export const ExtensionMessageType = {
    loading: 'loading',
    setDocument: 'setDocument',
    patchUnits: 'patchUnits',
    baseFile: 'baseFile',
    alSource: 'alSource',
    settings: 'settings',
    error: 'error',
} as const;
export type ExtensionMessageType = typeof ExtensionMessageType[keyof typeof ExtensionMessageType];

export interface LoadingPayload {
    readonly message: string;
}

export interface PatchUnitsPayload {
    readonly fileIndex: number;
    readonly units: readonly TransUnitDto[];
}

/** Whether the translation file's app has AL source to go to — a fact about the workspace, not the document. */
export interface AlSourcePayload {
    readonly available: boolean;
}

export interface ErrorPayload {
    readonly message: string;
    readonly line?: number;
    readonly col?: number;
}

/** Always `{ type, payload }`. */
export type ExtensionMessage =
    | { readonly type: typeof ExtensionMessageType.loading; readonly payload: LoadingPayload }
    | { readonly type: typeof ExtensionMessageType.setDocument; readonly payload: XliffDocumentDto }
    | { readonly type: typeof ExtensionMessageType.patchUnits; readonly payload: PatchUnitsPayload }
    | { readonly type: typeof ExtensionMessageType.baseFile; readonly payload: BaseFileDto | null }
    | { readonly type: typeof ExtensionMessageType.alSource; readonly payload: AlSourcePayload }
    | { readonly type: typeof ExtensionMessageType.settings; readonly payload: WebviewSettings }
    | { readonly type: typeof ExtensionMessageType.error; readonly payload: ErrorPayload };

// ── Webview → extension ──────────────────────────────────────────────────────

export const WebviewMessageType = {
    ready: 'ready',
    updateTarget: 'updateTarget',
    updateState: 'updateState',
    openSource: 'openSource',
} as const;
export type WebviewMessageType = typeof WebviewMessageType[keyof typeof WebviewMessageType];

/**
 * Where navigation goes: `source` is the unit's "Go to source" — the AL declaration, else
 * the unit in the base file, as the host decides — and `text` is the document-level escape
 * hatch the error pane offers when nothing parses.
 */
export const NavigationTarget = {
    source: 'source',
    text: 'text',
} as const;
export type NavigationTarget = typeof NavigationTarget[keyof typeof NavigationTarget];

/** Flat, unlike `ExtensionMessage`'s `{ type, payload }`. */
export type WebviewMessage =
    | { readonly type: typeof WebviewMessageType.ready }
    | {
        readonly type: typeof WebviewMessageType.updateTarget;
        readonly fileIndex: number;
        readonly unitId: string;
        readonly value: string;
        /** Omitted to let `xliffViewer.stateOnEdit` decide. */
        readonly state?: XliffState;
    }
    | {
        readonly type: typeof WebviewMessageType.updateState;
        readonly fileIndex: number;
        readonly unitId: string;
        readonly state: XliffState;
    }
    | {
        readonly type: typeof WebviewMessageType.openSource;
        readonly target: NavigationTarget;
        /** Both or neither. Without them the file itself opens, which is what the error pane offers. */
        readonly fileIndex?: number;
        readonly unitId?: string;
    };

// ── Guards ───────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function isOneOf<T extends string>(value: unknown, allowed: Readonly<Record<string, T>>): value is T {
    return typeof value === 'string' && (Object.values(allowed) as string[]).includes(value);
}

function isUnitReference(message: Record<string, unknown>): boolean {
    return typeof message.fileIndex === 'number'
        && Number.isInteger(message.fileIndex)
        && message.fileIndex >= 0
        && typeof message.unitId === 'string';
}

/**
 * Per-variant field checks, not just a known discriminant.
 *
 * These values reach a `WorkspaceEdit`: a message claiming to be an `updateTarget` without
 * a `value` must be rejected at the boundary, not discovered inside the writer.
 */
const WEBVIEW_MESSAGE_GUARDS: { readonly [K in WebviewMessage['type']]: (message: Record<string, unknown>) => boolean } = {
    ready: () => true,
    updateTarget: message => isUnitReference(message)
        && typeof message.value === 'string'
        && (message.state === undefined || typeof message.state === 'string'),
    updateState: message => isUnitReference(message) && typeof message.state === 'string',
    openSource: message => isOneOf(message.target, NavigationTarget)
        && (message.fileIndex === undefined && message.unitId === undefined ? true : isUnitReference(message)),
};

export function isWebviewMessage(value: unknown): value is WebviewMessage {
    const message = asRecord(value);
    if (message === undefined || !isOneOf(message.type, WebviewMessageType)) {
        return false;
    }
    return WEBVIEW_MESSAGE_GUARDS[message.type](message);
}

/**
 * Checks the envelope only.
 *
 * A webview receives messages it did not ask for — VS Code posts its own — so the guard
 * exists to ignore those. It does not re-validate a `XliffDocumentDto` the host built from
 * a document it just parsed; the asymmetry with `isWebviewMessage` is deliberate.
 */
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
    const message = asRecord(value);
    if (message === undefined || !isOneOf(message.type, ExtensionMessageType)) {
        return false;
    }
    return message.type === ExtensionMessageType.baseFile || asRecord(message.payload) !== undefined;
}

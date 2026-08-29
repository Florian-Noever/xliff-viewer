/**
 * The `postMessage` contract, defined once and imported by both runtimes (§8.3, §6.3,
 * `DEC-014`). There is nothing to keep in sync: one union per direction, one guard each.
 *
 * Everything crossing this boundary is an `as const` object, never a TypeScript `enum`
 * (§14.5) — enums are neither JSON-safe nor esbuild-safe across files.
 *
 * ## Two corrections to §8.3's table
 *
 * `patchUnits` carries `{ fileIndex, units }` rather than `{ units, summary,
 * nodeSummaries }`. The summaries went when `DEC-016` moved the roll-up into the webview,
 * and the file index is required by `DEC-028`: XLIFF scopes a trans-unit id to its
 * `<file>`, so an id alone does not identify a unit. Every message naming a unit carries
 * the index for the same reason.
 *
 * `settings` is a sixth extension → webview message. §13 requires five settings to reach
 * the view and §8.3 gave them no way to travel; folding them into `setDocument` would mean
 * re-sending a megabyte to toggle a checkbox.
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

export interface ErrorPayload {
    readonly message: string;
    readonly line?: number;
    readonly col?: number;
}

/** Always `{ type, payload }` (§8.3). */
export type ExtensionMessage =
    | { readonly type: typeof ExtensionMessageType.loading; readonly payload: LoadingPayload }
    | { readonly type: typeof ExtensionMessageType.setDocument; readonly payload: XliffDocumentDto }
    | { readonly type: typeof ExtensionMessageType.patchUnits; readonly payload: PatchUnitsPayload }
    | { readonly type: typeof ExtensionMessageType.baseFile; readonly payload: BaseFileDto | null }
    | { readonly type: typeof ExtensionMessageType.settings; readonly payload: WebviewSettings }
    | { readonly type: typeof ExtensionMessageType.error; readonly payload: ErrorPayload };

// ── Webview → extension ──────────────────────────────────────────────────────

export const WebviewMessageType = {
    ready: 'ready',
    updateTarget: 'updateTarget',
    updateState: 'updateState',
    openSource: 'openSource',
    copyToClipboard: 'copyToClipboard',
    notify: 'notify',
} as const;
export type WebviewMessageType = typeof WebviewMessageType[keyof typeof WebviewMessageType];

/** Where "go to source" goes (§10). `al` is the primary action (`DEC-009`). */
export const NavigationTarget = {
    al: 'al',
    base: 'base',
    text: 'text',
} as const;
export type NavigationTarget = typeof NavigationTarget[keyof typeof NavigationTarget];

export const NotifyKind = {
    info: 'info',
    warning: 'warning',
    error: 'error',
} as const;
export type NotifyKind = typeof NotifyKind[keyof typeof NotifyKind];

/** Flat, not `{ type, payload }` — §8.3 shapes the two directions differently. */
export type WebviewMessage =
    | { readonly type: typeof WebviewMessageType.ready }
    | {
        readonly type: typeof WebviewMessageType.updateTarget;
        readonly fileIndex: number;
        readonly unitId: string;
        readonly value: string;
        /** Omitted to let `xliffViewer.stateOnEdit` decide (§12.1). */
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
        readonly fileIndex: number;
        readonly unitId: string;
        readonly target: NavigationTarget;
    }
    | { readonly type: typeof WebviewMessageType.copyToClipboard; readonly text: string }
    | { readonly type: typeof WebviewMessageType.notify; readonly kind: NotifyKind; readonly message: string };

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
    openSource: message => isUnitReference(message) && isOneOf(message.target, NavigationTarget),
    copyToClipboard: message => typeof message.text === 'string',
    notify: message => isOneOf(message.kind, NotifyKind) && typeof message.message === 'string',
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

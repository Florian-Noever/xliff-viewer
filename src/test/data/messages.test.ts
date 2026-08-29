import { describe, expect, it } from 'vitest';

import {
    ExtensionMessageType,
    isExtensionMessage,
    isWebviewMessage,
    NavigationTarget,
    NotifyKind,
    WebviewMessageType,
} from '../../shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { XliffState } from '../../shared/state';

import type { WebviewMessage } from '../../shared/messages';

const VALID: readonly WebviewMessage[] = [
    { type: WebviewMessageType.ready },
    { type: WebviewMessageType.updateTarget, fileIndex: 0, unitId: 'Table 1 - Property 2', value: 'Kunde' },
    { type: WebviewMessageType.updateTarget, fileIndex: 1, unitId: 'x', value: '', state: XliffState.signedOff },
    { type: WebviewMessageType.updateState, fileIndex: 0, unitId: 'x', state: XliffState.translated },
    { type: WebviewMessageType.openSource, fileIndex: 0, unitId: 'x', target: NavigationTarget.al },
    { type: WebviewMessageType.copyToClipboard, text: 'anything' },
    { type: WebviewMessageType.notify, kind: NotifyKind.warning, message: 'careful' },
];

describe('isWebviewMessage', () => {
    it('accepts every variant of the union', () => {
        for (const message of VALID) {
            expect(isWebviewMessage(message), message.type).toBe(true);
        }
    });

    it('covers every type in the union', () => {
        expect(new Set(VALID.map(message => message.type))).toEqual(new Set(Object.values(WebviewMessageType)));
    });

    it('rejects anything that is not a tagged object', () => {
        for (const value of [null, undefined, {}, [], 42, 'ready', { type: 42 }, { type: 'unknown' }]) {
            expect(isWebviewMessage(value), JSON.stringify(value ?? null)).toBe(false);
        }
    });

    it('rejects a known type whose fields are missing or wrong', () => {
        // These reach a WorkspaceEdit; a type-only guard would pass them through.
        const bad: unknown[] = [
            { type: 'updateTarget' },
            { type: 'updateTarget', fileIndex: 0, unitId: 'x' },
            { type: 'updateTarget', fileIndex: 0, unitId: 'x', value: 42 },
            { type: 'updateTarget', fileIndex: '0', unitId: 'x', value: 'v' },
            { type: 'updateTarget', fileIndex: -1, unitId: 'x', value: 'v' },
            { type: 'updateTarget', fileIndex: 1.5, unitId: 'x', value: 'v' },
            { type: 'updateTarget', fileIndex: 0, unitId: 42, value: 'v' },
            { type: 'updateState', fileIndex: 0, unitId: 'x' },
            { type: 'openSource', fileIndex: 0, unitId: 'x', target: 'elsewhere' },
            { type: 'copyToClipboard' },
            { type: 'notify', kind: 'shout', message: 'hi' },
            { type: 'notify', kind: 'info' },
        ];

        for (const value of bad) {
            expect(isWebviewMessage(value), JSON.stringify(value)).toBe(false);
        }
    });

    it('accepts an updateTarget with an empty value — clearing a translation is legal', () => {
        expect(isWebviewMessage({ type: 'updateTarget', fileIndex: 0, unitId: 'x', value: '' })).toBe(true);
    });
});

describe('isExtensionMessage', () => {
    it('accepts every variant of the union', () => {
        const messages: unknown[] = [
            { type: ExtensionMessageType.loading, payload: { message: 'Parsing…' } },
            { type: ExtensionMessageType.setDocument, payload: { uri: 'file:///x', fileName: 'x.xlf', isBaseFile: false, readOnly: false, files: [] } },
            { type: ExtensionMessageType.patchUnits, payload: { fileIndex: 0, units: [] } },
            { type: ExtensionMessageType.baseFile, payload: { uri: 'file:///b', fileName: 'b.g.xlf' } },
            { type: ExtensionMessageType.settings, payload: DEFAULT_WEBVIEW_SETTINGS },
            { type: ExtensionMessageType.error, payload: { message: 'broken', line: 2, col: 3 } },
        ];

        for (const message of messages) {
            expect(isExtensionMessage(message), JSON.stringify(message).slice(0, 40)).toBe(true);
        }
    });

    it('accepts a null baseFile payload — resolution ran and found nothing', () => {
        expect(isExtensionMessage({ type: ExtensionMessageType.baseFile, payload: null })).toBe(true);
    });

    it('rejects foreign messages, which a webview receives from VS Code itself', () => {
        for (const value of [null, {}, { type: 'vscode-internal' }, { type: 42 }, 'garbage']) {
            expect(isExtensionMessage(value), JSON.stringify(value ?? null)).toBe(false);
        }
    });

    it('rejects a known type with no payload', () => {
        expect(isExtensionMessage({ type: ExtensionMessageType.loading })).toBe(false);
        expect(isExtensionMessage({ type: ExtensionMessageType.settings, payload: 'nope' })).toBe(false);
    });
});

describe('the constants that cross the boundary', () => {
    it('are plain string maps whose key is its own value (§14.5)', () => {
        // Not a TS enum: an enum is neither JSON-safe nor esbuild-safe across files, and a
        // key that drifts from its value makes a message unmatchable on the far side.
        for (const map of [ExtensionMessageType, WebviewMessageType, NavigationTarget, NotifyKind]) {
            for (const [key, value] of Object.entries(map)) {
                expect(value).toBe(key);
            }
        }
    });

    it('names navigation targets exactly as §8.3 does', () => {
        expect(Object.values(NavigationTarget).sort()).toEqual(['al', 'base', 'text']);
    });
});

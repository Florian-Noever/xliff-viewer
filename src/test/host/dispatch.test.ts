import { beforeEach, describe, expect, it } from 'vitest';

import { dispatch } from '../../extension/handlers';
import { NavigationTarget, WebviewMessageType } from '../../shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { XliffState } from '../../shared/state';
import { flushErrorMessages, flushLogs } from '../__mocks__/vscode';

import type { HandlerContext } from '../../extension/handlers/handlerContext';
import type { DocumentView } from '../../extension/editor/documentView';
import type { UnitReference } from '../../shared/model';
import type { ExtensionMessage, WebviewMessage } from '../../shared/messages';

interface Recorded {
    readonly what: string;
    readonly unit?: UnitReference;
    readonly rest?: unknown;
}

function fixture(view?: Partial<DocumentView>) {
    const calls: Recorded[] = [];
    const posted: ExtensionMessage[] = [];

    const record = (what: string, unit?: UnitReference, rest?: unknown): void => {
        calls.push({ what, unit, rest });
    };

    const context: HandlerContext = {
        post: message => posted.push(message),
        settings: () => DEFAULT_WEBVIEW_SETTINGS,
        view: {
            sendDocument: () => record('sendDocument'),
            updateTarget: (unit, value, state) => record('updateTarget', unit, { value, state }),
            updateState: (unit, state) => record('updateState', unit, state),
            openSource: (target, unit) => record('openSource', unit, target),
            ...view,
        },
    };

    return { calls, posted, context };
}

beforeEach(() => {
    flushLogs();
});

describe('routing', () => {
    it('answers ready with the settings, then the document', async () => {
        const { calls, posted, context } = fixture();

        await dispatch({ type: WebviewMessageType.ready }, context);

        expect(posted).toEqual([{ type: 'settings', payload: DEFAULT_WEBVIEW_SETTINGS }]);
        expect(calls).toEqual([{ what: 'sendDocument' }]);
    });

    it('passes a unit reference through as file index plus id', async () => {
        const { calls, context } = fixture();

        await dispatch({ type: WebviewMessageType.updateTarget, fileIndex: 1, unitId: 'Table 1 - Property 2', value: 'Kunde' }, context);

        expect(calls).toEqual([{
            what: 'updateTarget',
            unit: { fileIndex: 1, unitId: 'Table 1 - Property 2' },
            rest: { value: 'Kunde', state: undefined },
        }]);
    });

    it('leaves an omitted state undefined, so stateOnEdit decides', async () => {
        const { calls, context } = fixture();

        await dispatch({ type: WebviewMessageType.updateTarget, fileIndex: 0, unitId: 'x', value: 'v', state: XliffState.final }, context);
        await dispatch({ type: WebviewMessageType.updateTarget, fileIndex: 0, unitId: 'x', value: 'v' }, context);

        expect(calls.map(call => (call.rest as { state?: string }).state)).toEqual([XliffState.final, undefined]);
    });

    it('routes updateState and openSource', async () => {
        const { calls, context } = fixture();

        await dispatch({ type: WebviewMessageType.updateState, fileIndex: 0, unitId: 'x', state: XliffState.needsAdaptation }, context);
        await dispatch({ type: WebviewMessageType.openSource, fileIndex: 0, unitId: 'x', target: NavigationTarget.source }, context);

        expect(calls.map(call => call.what)).toEqual(['updateState', 'openSource']);
        expect(calls[0].rest).toBe(XliffState.needsAdaptation);
        expect(calls[1].rest).toBe(NavigationTarget.source);
        expect(calls[1].unit).toEqual({ fileIndex: 0, unitId: 'x' });
    });

    it('has a handler for every message the union declares', async () => {
        // The map is keyed by WebviewMessage['type'], so a missing one is a compile error;
        // this asserts none of them throws "not a function" at runtime either.
        const messages: readonly WebviewMessage[] = [
            { type: WebviewMessageType.ready },
            { type: WebviewMessageType.updateTarget, fileIndex: 0, unitId: 'x', value: 'v' },
            { type: WebviewMessageType.updateState, fileIndex: 0, unitId: 'x', state: XliffState.translated },
            { type: WebviewMessageType.openSource, fileIndex: 0, unitId: 'x', target: NavigationTarget.text },
        ];
        expect(messages.map(message => message.type)).toEqual(Object.values(WebviewMessageType));

        const { context } = fixture();
        for (const message of messages) {
            await dispatch(message, context);
        }

        expect(flushErrorMessages()).toEqual([]);
    });
});

describe('a handler that throws', () => {
    const failing = {
        sendDocument: (): never => {
            throw new Error('parse blew up');
        },
    };

    it('is logged and shown, not rethrown', async () => {
        const { context } = fixture(failing);

        await expect(dispatch({ type: WebviewMessageType.ready }, context)).resolves.toBeUndefined();

        expect(flushErrorMessages()).toEqual(['XLIFF Viewer: parse blew up']);
        expect(flushLogs().join('\n')).toContain('Handling "ready" failed: parse blew up');
    });

    it('leaves the dispatcher able to handle the next message', async () => {
        const { calls, context } = fixture(failing);

        await dispatch({ type: WebviewMessageType.ready }, context);
        flushErrorMessages();
        await dispatch({ type: WebviewMessageType.updateState, fileIndex: 0, unitId: 'x', state: XliffState.translated }, context);

        expect(calls.map(call => call.what)).toEqual(['updateState']);
        expect(flushErrorMessages()).toEqual([]);
    });

    it('absorbs a rejected promise as well as a synchronous throw', async () => {
        const { context } = fixture({ sendDocument: () => Promise.reject(new Error('async failure')) });

        await dispatch({ type: WebviewMessageType.ready }, context);

        expect(flushErrorMessages()).toEqual(['XLIFF Viewer: async failure']);
    });

    it('does not put a thrown non-Error into the notification', async () => {
        const { context } = fixture({
            sendDocument: (): never => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal -- the case under test
                throw 'a bare string';
            },
        });

        await dispatch({ type: WebviewMessageType.ready }, context);

        expect(flushErrorMessages()).toEqual(['XLIFF Viewer: unknown error']);
    });
});

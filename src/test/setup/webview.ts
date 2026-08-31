/**
 * Installs `acquireVsCodeApi` before any webview module loads, so `src/webview/vscode.ts`
 * caches a real handle rather than undefined.
 *
 * The stub records what the webview posts. Tests import `postedMessages` from here — the
 * setup file and the test share one module instance, so it is the same array.
 */

import { beforeEach } from 'vitest';

export const postedMessages: unknown[] = [];

export function clearPostedMessages(): void {
    postedMessages.length = 0;
}

/**
 * The one `setState` slot a webview gets, as a real value rather than a no-op.
 *
 * `POLISH-03` is about what survives the webview being destroyed and rebuilt, so a test has
 * to be able to write the slot, throw the component away, and read what a fresh mount finds.
 */
let state: unknown;

export function webviewState(): unknown {
    return state;
}

export function setWebviewState(value: unknown): void {
    state = value;
}

// Every test starts with an empty slot. `POLISH-03` made mounting the app *write* one, so
// without this a test inherits whatever the previous test left behind — and a filter test
// would start with the last test's filter applied.
beforeEach(() => {
    state = undefined;
    postedMessages.length = 0;
});

(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
    postMessage: (message: unknown) => postedMessages.push(message),
    getState: () => state,
    setState: (value: unknown) => {
        state = value;
    },
});

/**
 * jsdom has no `ResizeObserver`, and `@tanstack/vue-virtual` observes the scroll element
 * with one. Without this the virtualiser never learns the viewport size and renders
 * nothing, which would make every tree test pass for the wrong reason.
 */
class StubResizeObserver {
    public observe(): void { }
    public unobserve(): void { }
    public disconnect(): void { }
}

(globalThis as Record<string, unknown>).ResizeObserver ??= StubResizeObserver;

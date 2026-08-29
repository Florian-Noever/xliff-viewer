/**
 * Installs `acquireVsCodeApi` before any webview module loads, so `src/webview/vscode.ts`
 * caches a real handle rather than undefined.
 *
 * The stub records what the webview posts. Tests import `postedMessages` from here — the
 * setup file and the test share one module instance, so it is the same array.
 */

export const postedMessages: unknown[] = [];

export function clearPostedMessages(): void {
    postedMessages.length = 0;
}

(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
    postMessage: (message: unknown) => postedMessages.push(message),
    getState: () => undefined,
    setState: () => { },
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

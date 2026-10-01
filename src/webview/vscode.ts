import type { WebviewApi } from 'vscode-webview';

/**
 * `acquireVsCodeApi` may be called only once per webview, so the handle is cached here.
 * It is undefined under the Vite dev server, which is what makes browser development work.
 */
const api: WebviewApi<unknown> | undefined =
    typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

export const isVscode: boolean = api !== undefined;

export function postMessage(message: unknown): void {
    api?.postMessage(message);
}

/** Whatever this webview last stored, unchecked: the caller narrows it. */
export function getState(): unknown {
    return api?.getState();
}

export function setState(state: unknown): void {
    api?.setState(state);
}

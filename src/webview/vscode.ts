export interface VscodeApi {
    postMessage(message: unknown): void;
    getState<T = unknown>(): T | undefined;
    setState<T = unknown>(state: T): void;
}

declare function acquireVsCodeApi(): VscodeApi;

/**
 * `acquireVsCodeApi` may be called only once per webview, so the handle is cached here.
 * It is undefined under the Vite dev server, which is what makes browser development work.
 */
const api: VscodeApi | undefined =
    typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

export const isVscode: boolean = api !== undefined;

export function postMessage(message: unknown): void {
    api?.postMessage(message);
}

export function getState<T = unknown>(): T | undefined {
    return api?.getState<T>();
}

export function setState<T = unknown>(state: T): void {
    api?.setState(state);
}

import { vi } from 'vitest';

// Provide acquireVsCodeApi as a global before any webview module loads, so
// src/webview/vscode.ts caches a stub rather than undefined.
(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
    postMessage: vi.fn(),
    getState: vi.fn(() => undefined),
    setState: vi.fn(),
});

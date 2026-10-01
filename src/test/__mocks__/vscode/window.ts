/** The `window` namespace: messages, progress, editors shown and picked, the custom editor and the log. */

import { Disposable } from './events';

import type { Range, Selection } from './documents';
import type { Uri } from './uri';

export const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const;

export const TextEditorRevealType = { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 } as const;

/** One `withProgress` call: where it showed, what it said, and whether its task has ended. */
export interface ProgressRecord {
    readonly location?: number;
    readonly title: string;
    done: boolean;
}

/** What the extension asked for when it registered its editor, options included. */
export const customEditorRegistrations: { viewType: string; options?: unknown }[] = [];

let errorMessages: string[] = [];
let warningMessages: string[] = [];
let infoMessages: string[] = [];
let progressRecords: ProgressRecord[] = [];
let shownDocuments: { path: string; selection?: Range }[] = [];
let revealedPositions: { path: string; line: number }[] = [];
let quickPickCalls: { label: string; description?: string }[][] = [];
let quickPickChoice: number | undefined;
let logLines: string[] = [];

/** Records where navigation put the cursor, which is what the reveal tests assert on. */
export class FakeTextEditor {
    public readonly document: { uri: Uri; getText(): string };
    public selection: Selection | undefined;

    public constructor(document: { uri: Uri; getText(): string }) {
        this.document = document;
    }

    public revealRange(range: Range, _type?: number): void {
        revealedPositions.push({ path: this.document.uri.path, line: range.start.line });
    }
}

export const window = {
    visibleTextEditors: [] as { document: { uri: Uri; getText(): string } }[],
    activeTextEditor: undefined as { document: { uri: Uri; getText(): string } } | undefined,
    showErrorMessage: (message: string): Promise<undefined> => {
        errorMessages.push(message);
        return Promise.resolve(undefined);
    },
    showWarningMessage: (message: string): Promise<undefined> => {
        warningMessages.push(message);
        return Promise.resolve(undefined);
    },
    showInformationMessage: (message: string): Promise<undefined> => {
        infoMessages.push(message);
        return Promise.resolve(undefined);
    },
    withProgress: <T>(options: { location?: number; title?: string }, task: () => Promise<T>): Promise<T> => {
        const record: ProgressRecord = { location: options.location, title: options.title ?? '', done: false };
        progressRecords.push(record);
        const running = task();
        void running.then(() => {
            record.done = true;
        }, () => {
            record.done = true;
        });
        return running;
    },
    showTextDocument: (document: { uri: Uri; getText(): string }, options?: { selection?: Range }): Promise<FakeTextEditor> => {
        shownDocuments.push({ path: document.uri.path, selection: options?.selection });
        return Promise.resolve(new FakeTextEditor(document));
    },
    showQuickPick: <T extends { label: string; description?: string }>(items: T[], _options?: unknown): Promise<T | undefined> => {
        quickPickCalls.push(items.map(item => ({ label: item.label, description: item.description })));
        return Promise.resolve(quickPickChoice === undefined ? undefined : items[quickPickChoice]);
    },
    registerCustomEditorProvider: (viewType: string, _provider: unknown, options?: unknown): Disposable => {
        customEditorRegistrations.push({ viewType, options });
        return new Disposable(() => { });
    },
    createOutputChannel: (_name: string, _options?: unknown) => ({
        trace: (message: string) => logLines.push(`trace ${message}`),
        debug: (message: string) => logLines.push(`debug ${message}`),
        info: (message: string) => logLines.push(`info ${message}`),
        warn: (message: string) => logLines.push(`warn ${message}`),
        error: (message: string) => logLines.push(`error ${message}`),
        dispose: () => { },
    }),
};

// ── arrange ──────────────────────────────────────────────────────────────────
/** Which QuickPick entry the next `showQuickPick` returns; undefined means cancelled. */
export function setQuickPickResult(index: number | undefined): void {
    quickPickChoice = index;
}

// ── assert ───────────────────────────────────────────────────────────────────
export function flushErrorMessages(): string[] {
    return errorMessages.splice(0);
}

export function flushWarningMessages(): string[] {
    return warningMessages.splice(0);
}

export function flushInfoMessages(): string[] {
    return infoMessages.splice(0);
}

/** The progress shown so far; a record keeps updating after it is taken, so `done` can be watched. */
export function flushProgress(): ProgressRecord[] {
    return progressRecords.splice(0);
}

export function flushProgressTitles(): string[] {
    return flushProgress().map(record => record.title);
}

/** Which documents were shown, and with which selection. */
export function flushShownDocuments(): { path: string; selection?: Range }[] {
    return shownDocuments.splice(0);
}

export function flushRevealedPositions(): { path: string; line: number }[] {
    return revealedPositions.splice(0);
}

export function flushQuickPicks(): { label: string; description?: string }[][] {
    return quickPickCalls.splice(0);
}

/** Everything written to the `LogOutputChannel`, each line prefixed with its level. */
export function flushLogs(): string[] {
    return logLines.splice(0);
}

export function resetWindow(): void {
    customEditorRegistrations.length = 0;
    window.visibleTextEditors = [];
    window.activeTextEditor = undefined;
    errorMessages = [];
    warningMessages = [];
    infoMessages = [];
    progressRecords = [];
    shownDocuments = [];
    revealedPositions = [];
    quickPickCalls = [];
    quickPickChoice = undefined;
    logLines = [];
}

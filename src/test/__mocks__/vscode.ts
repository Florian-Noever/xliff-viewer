/**
 * Hand-written stand-in for the `vscode` module, aliased in by the `host` and `perf` Vitest
 * projects. It models only what the extension calls, split by concern under `./vscode/`.
 * Each part records what was called, with `flush*` helpers to assert on it, `set*` helpers
 * to arrange state, and `resetMocks()` between tests. No auto-mocking library.
 */

import { resetCommands } from './vscode/commands';
import { resetConfiguration } from './vscode/configuration';
import { resetDocuments } from './vscode/documents';
import { resetEvents } from './vscode/events';
import { resetFileSystem } from './vscode/fileSystem';
import { resetWindow } from './vscode/window';
import { resetWorkspace } from './vscode/workspace';

export { commands, flushExecutedCommands } from './vscode/commands';
export {
    configurationChange,
    configurationListenerCount,
    fireConfigurationChange,
    flushConfigurationScopes,
    setConfigOverride,
    setUserConfigOverride,
    setWorkspaceTrusted,
} from './vscode/configuration';
export type { ConfigurationChangeEvent } from './vscode/configuration';
export {
    documentChangeListenerCount,
    FakeTextDocument,
    fireTextDocumentChange,
    flushAppliedEdits,
    Position,
    Range,
    reportEditsInPieces,
    Selection,
    setApplyEditResult,
    setOpenDocument,
    WorkspaceEdit,
} from './vscode/documents';
export type { ContentChange, EditRecord, TextDocumentChangeEvent } from './vscode/documents';
export { Disposable, emitterListenerCount, EventEmitter } from './vscode/events';
export {
    FileType,
    fireFileWatcher,
    flushFileReads,
    flushFileWrites,
    holdFileRead,
    removeVirtualFile,
    setVirtualFile,
    setWritableFileSystem,
    watcherCount,
} from './vscode/fileSystem';
export { RelativePattern, Uri } from './vscode/uri';
export {
    customEditorRegistrations,
    FakeTextEditor,
    flushErrorMessages,
    flushInfoMessages,
    flushLogs,
    flushProgress,
    flushProgressTitles,
    flushQuickPicks,
    flushRevealedPositions,
    flushShownDocuments,
    flushWarningMessages,
    ProgressLocation,
    setQuickPickResult,
    TextEditorRevealType,
    window,
} from './vscode/window';
export type { ProgressRecord } from './vscode/window';
export { setSearchAvailable, setWorkspaceRoot, workspace } from './vscode/workspace';

export function resetMocks(): void {
    resetCommands();
    resetConfiguration();
    resetDocuments();
    resetEvents();
    resetFileSystem();
    resetWindow();
    resetWorkspace();
}

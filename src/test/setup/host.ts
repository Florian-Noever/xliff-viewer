/**
 * The host and perf projects' setup: every test starts with a logger and ends with the
 * `vscode` mock reset and real timers back, so no test inherits another's state.
 */

import { afterEach, beforeEach, vi } from 'vitest';

import { Logger } from '../../extension/services/logger';
import { resetMocks } from '../__mocks__/vscode';

import type * as vscode from 'vscode';

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
});

afterEach(() => {
    resetMocks();
    vi.useRealTimers();
});

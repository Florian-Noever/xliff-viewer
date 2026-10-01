import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { showTransientNotice } from '../../extension/services/transientNotice';
import { flushProgress } from '../__mocks__/vscode';

beforeEach(() => {
    vi.useFakeTimers();
});

describe('showTransientNotice', () => {
    it('is a notification that closes on its own after five seconds', async () => {
        showTransientNotice('Shown in the base file instead.');
        const [notice] = flushProgress();

        expect(notice).toMatchObject({ location: vscode.ProgressLocation.Notification, title: 'Shown in the base file instead.', done: false });
        await vi.advanceTimersByTimeAsync(4999);
        expect(notice.done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(notice.done).toBe(true);
    });
});

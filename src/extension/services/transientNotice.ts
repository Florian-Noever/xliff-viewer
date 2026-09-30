import * as vscode from 'vscode';

/** How long a notice stays, unless the reader closes it first. */
const NOTICE_MS = 5000;

/**
 * A notification that goes away on its own.
 *
 * `showInformationMessage` stays until dismissed, which is too much for "this is where you
 * landed, and why". A progress notification closes when its task ends, so a task that only
 * waits gives a notice with a lifetime. Fired, never awaited: nothing waits for it to close.
 */
export function showTransientNotice(message: string, duration = NOTICE_MS): void {
    void vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: message },
        () => new Promise<void>((resolve) => {
            setTimeout(resolve, duration);
        }),
    );
}

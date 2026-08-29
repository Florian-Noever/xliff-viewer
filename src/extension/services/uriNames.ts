import type * as vscode from 'vscode';

/**
 * Reading names out of a URI.
 *
 * One place, because the rule had grown four copies and because it is easy to reach for
 * `fsPath` instead — which is wrong for a web host, where a document's URI has no file
 * system behind it at all (§6.5). `path` is the portable field.
 *
 * A URI is **never** identified by its `path`: on Windows the drive letter's case differs
 * between a joined URI and the one the host hands back, and only `toString()` normalises
 * it. These functions produce display text, never a key.
 */

/** `file:///w/Translations/App.de-DE.xlf` → `App.de-DE.xlf`. */
export function fileNameOf(uri: vscode.Uri): string {
    return uri.path.slice(uri.path.lastIndexOf('/') + 1);
}

/** `App.de-DE.xlf` → `App`, which is the app name a base file is named after (§9.2). */
export function appNameOf(uri: vscode.Uri): string {
    const withoutExtension = fileNameOf(uri).replace(/\.xlf$/i, '');
    const dot = withoutExtension.lastIndexOf('.');
    return dot < 0 ? withoutExtension : withoutExtension.slice(0, dot);
}

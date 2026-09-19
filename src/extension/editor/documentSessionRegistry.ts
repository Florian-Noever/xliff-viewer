import { XliffDocumentSession } from './documentSession';

import type * as vscode from 'vscode';

/**
 * One session per document URI, shared by every editor showing it.
 *
 * Reference-counted rather than keyed on the view: two editors on the same
 * `TextDocument` must not parse it twice per change, and the session must outlive the
 * first of them being closed.
 */
export class DocumentSessionRegistry {
    private readonly sessions = new Map<string, { readonly session: XliffDocumentSession; views: number }>();

    /** Every `acquire` must be matched by exactly one `release`. */
    public acquire(textDocument: vscode.TextDocument): XliffDocumentSession {
        const key = textDocument.uri.toString();
        const existing = this.sessions.get(key);

        if (existing !== undefined) {
            existing.views++;
            return existing.session;
        }

        const session = new XliffDocumentSession(textDocument);
        this.sessions.set(key, { session, views: 1 });
        return session;
    }

    public release(session: XliffDocumentSession): void {
        const key = session.uri.toString();
        const entry = this.sessions.get(key);
        if (entry === undefined) {
            return;
        }

        entry.views--;
        if (entry.views <= 0) {
            entry.session.dispose();
            this.sessions.delete(key);
        }
    }

    public get size(): number {
        return this.sessions.size;
    }

    public dispose(): void {
        for (const entry of this.sessions.values()) {
            entry.session.dispose();
        }
        this.sessions.clear();
    }
}

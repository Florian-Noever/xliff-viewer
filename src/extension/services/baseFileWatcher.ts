import * as vscode from 'vscode';

const BASE_FILE_GLOB = '**/*.g.xlf';

/**
 * One watcher for every base file in the workspace. Appearing, changing and going away are
 * one event, since each of them changes which base file pairs with a document or what it
 * says.
 */
export class BaseFileWatcher implements vscode.Disposable {
    private readonly changed = new vscode.EventEmitter<vscode.Uri>();
    private readonly subscriptions: vscode.Disposable[];

    /** A base file appeared, changed or went away. */
    public readonly onDidChange: vscode.Event<vscode.Uri> = this.changed.event;

    public constructor() {
        const watcher = vscode.workspace.createFileSystemWatcher(BASE_FILE_GLOB);
        this.subscriptions = [
            watcher,
            this.changed,
            watcher.onDidCreate(uri => this.changed.fire(uri)),
            watcher.onDidChange(uri => this.changed.fire(uri)),
            watcher.onDidDelete(uri => this.changed.fire(uri)),
        ];
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions.length = 0;
    }
}

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('xliff-viewer.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from XLIFF Viewer!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }

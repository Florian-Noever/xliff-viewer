import { XliffEditorProvider } from './editor/xliffEditorProvider';
import { Logger } from './services/logger';

import type * as vscode from 'vscode';

const DISPLAY_NAME = 'XLIFF Viewer';

export function activate(context: vscode.ExtensionContext): void {
    Logger.initialize(context, DISPLAY_NAME);

    context.subscriptions.push(XliffEditorProvider.register(context));

    Logger.info(`Activated "${DISPLAY_NAME}".`);
}

export function deactivate(): void { }

import * as vscode from 'vscode';

const TEMPLATE = ['media', 'webview.html'];
const BUNDLE = 'public';

/** Web-safe nonce. `Math.random` is not acceptable for a CSP nonce. */
function createNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Directories the webview may load resources from. */
export function localResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
    return [
        vscode.Uri.joinPath(extensionUri, BUNDLE),
        vscode.Uri.joinPath(extensionUri, ...TEMPLATE.slice(0, 1)),
    ];
}

/**
 * Reads the shell template and fills in its four placeholders. Asset URIs always go
 * through `asWebviewUri` — the web host serves them over a service worker, so a
 * hand-built path does not resolve there.
 */
export async function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): Promise<string> {
    const templateUri = vscode.Uri.joinPath(extensionUri, ...TEMPLATE);
    const bytes = await vscode.workspace.fs.readFile(templateUri);
    const template = new TextDecoder().decode(bytes);

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, BUNDLE, 'app.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, BUNDLE, 'styles.css'));

    return template
        .replace(/%NONCE%/g, createNonce())
        .replace(/%CSP_SOURCE%/g, webview.cspSource)
        .replace(/%SCRIPT_URI%/g, scriptUri.toString())
        .replace(/%CSS_URI%/g, cssUri.toString());
}

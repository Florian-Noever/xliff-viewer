import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

/**
 * Desktop host runner. Plain node, bundled to CJS, never shipped in the VSIX — so
 * `__dirname` and `node:path` are appropriate here. The §6.5 no-node-builtins rule
 * governs shipped extension code (src/extension, src/shared, src/webview), not this.
 */

/**
 * On Windows `@vscode/test-electron` spawns with `shell: true` but quotes only the
 * executable, so any argument containing a space is split by the shell. This repository
 * lives under "Visual Studio Code", which contains two. Pre-quoting the value keeps it
 * a single token; the shell strips the quotes again before VS Code parses it.
 */
function shellSafe(value: string): string {
    return process.platform === 'win32' && value.includes(' ') ? `"${value}"` : value;
}

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './integration/index.js');

    await runTests({
        extensionDevelopmentPath: shellSafe(extensionDevelopmentPath),
        extensionTestsPath: shellSafe(extensionTestsPath),
        // Open the repo itself so the tests can resolve Examples/test.xlf.
        launchArgs: [shellSafe(extensionDevelopmentPath), '--disable-extensions'],
    });
}

main().catch((error: unknown) => {
    process.exitCode = 1;
    throw error instanceof Error ? error : new Error(String(error));
});

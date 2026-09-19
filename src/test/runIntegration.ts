import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

/**
 * Desktop host runner. Plain node, bundled to CJS, never shipped in the VSIX — so
 * `__dirname` and `node:path` are appropriate here. The no-node-builtins rule governs
 * shipped extension code (src/extension, src/shared, src/webview), not this.
 */

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './integration/index.js');

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        // Open the repo itself so the tests can resolve the fixtures in src/test/fixtures/xliff.
        launchArgs: [extensionDevelopmentPath, '--disable-extensions'],
    });
}

main().catch((error: unknown) => {
    process.exitCode = 1;
    throw error instanceof Error ? error : new Error(String(error));
});

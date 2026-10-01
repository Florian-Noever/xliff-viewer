import Mocha from 'mocha';

import { runMocha, TEST_TIMEOUT_MS } from './mochaRun';

/**
 * Desktop entry. The node build of Mocha is used rather than `mocha/mocha`: the browser
 * build reads `window.location.search` on run, which the node extension host does not have.
 *
 * `pre-require` installs the tdd globals, and must happen before the test modules are
 * evaluated, which the import order of `desktopEntry.ts` guarantees.
 */
const mocha = new Mocha({ ui: 'tdd', color: true, timeout: TEST_TIMEOUT_MS });
mocha.suite.emit('pre-require', globalThis, '', mocha);

export function run(): Promise<void> {
    return runMocha(mocha);
}

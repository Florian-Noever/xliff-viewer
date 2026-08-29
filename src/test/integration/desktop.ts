import Mocha from 'mocha';

import { runMocha } from './mochaRun';

/**
 * Desktop entry. The node build of Mocha is used rather than `mocha/mocha`: the browser
 * build reads `window.location.search` on run, which the node extension host does not have.
 *
 * `pre-require` installs the tdd globals, and must happen before the test modules below
 * are evaluated — which static import order guarantees.
 */
const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20_000 });
mocha.suite.emit('pre-require', globalThis, '', mocha);

export function run(): Promise<void> {
    return runMocha(mocha);
}

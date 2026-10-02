import Mocha from 'mocha';

import { MOCHA_OPTIONS, runMocha } from './mochaRun';

/**
 * Desktop entry. The node build of Mocha is used rather than `mocha/mocha`: the browser
 * build reads `window.location.search` on run, which the node extension host does not have.
 *
 * `pre-require` installs the tdd globals, and must happen before the test modules are
 * evaluated, which the import order of `desktopEntry.ts` guarantees.
 */
const mocha = new Mocha({ ...MOCHA_OPTIONS, color: true });
mocha.suite.emit('pre-require', globalThis, '', mocha);

export function run(): Promise<void> {
    return runMocha(mocha);
}

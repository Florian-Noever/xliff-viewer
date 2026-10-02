// The browser build defines the global `mocha` object, which the web host can use.
import 'mocha/mocha';

import { MOCHA_OPTIONS, runMocha } from './mochaRun';

// Must run before any test module is evaluated, so the tdd globals exist.
mocha.setup({ ...MOCHA_OPTIONS, reporter: undefined });

export function run(): Promise<void> {
    return runMocha(mocha);
}

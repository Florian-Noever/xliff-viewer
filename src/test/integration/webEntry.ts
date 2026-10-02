// Order matters: './web' installs mocha's tdd globals, which the suites need at
// evaluation time. Static imports evaluate in source order.
import './web';
import './suites';

export { run } from './web';

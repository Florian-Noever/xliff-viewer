// Order matters: './desktop' installs mocha's tdd globals, which the suites need at
// evaluation time. Static imports evaluate in source order.
import './desktop';
import './suites';

export { run } from './desktop';

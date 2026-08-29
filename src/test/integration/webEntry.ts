// Order matters: './web' installs mocha's tdd globals, which the test modules need at
// evaluation time. Static imports evaluate in source order.
import './web';
import './editor.test';

export { run } from './web';

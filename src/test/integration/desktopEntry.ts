// Order matters: './desktop' installs mocha's tdd globals, which the test modules
// need at evaluation time. Static imports evaluate in source order.
import './desktop';
import './editor.test';
import './navigation.test';
import './edit.test';

export { run } from './desktop';

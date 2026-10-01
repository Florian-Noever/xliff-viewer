/**
 * The data project's global setup. With `UPDATE_FIXTURES=1` it rewrites every generated
 * fixture once, before any worker starts, so the tests that compare against them read the
 * new files.
 */

import { writeCorpus, writeDevDocuments } from '../fixtures/writeFixtures';

export default function setup(): void {
    if (process.env.UPDATE_FIXTURES === '1') {
        writeCorpus();
        writeDevDocuments();
    }
}

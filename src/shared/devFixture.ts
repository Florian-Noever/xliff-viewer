/**
 * Which slice of the fixture corpus the dev-server fixture is built from.
 *
 * Lives in `src/shared/` because two very different things need to agree on it: the
 * webview's committed fixture, and the data test that rebuilds it from
 * `src/test/fixtures/xliff/` and asserts they still match, so the dev server always shows
 * what the extension would send for that file.
 */

import { splitUnitId } from './unitPath';

export const DEV_FIXTURE_SOURCE = 'Fabrikam Base.de-DE.xlf';

/**
 * Five root objects, chosen for what they cover rather than for being first:
 *
 * - `Codeunit 562451849` — carries a `maxwidth`, and many units under one object.
 * - `Table 1518856175` and `Page 1518856175` — the **same hash under two object types**,
 *   so the tree has to keep them apart on screen as well as in the model.
 * - `PageExtension 465446794` — four segments deep, and mixes translated with empty.
 * - `PageExtension 3965510573` — mixed states, with `al-object-target` present.
 *
 * Between them: translated and empty units, an empty source, both tree depths, and every
 * optional trans-unit attribute AL emits.
 */
export const DEV_FIXTURE_ROOTS: readonly string[] = [
    'Codeunit 562451849',
    'Table 1518856175',
    'Page 1518856175',
    'PageExtension 465446794',
    'PageExtension 3965510573',
];

/** True for a unit the fixture includes. */
export function isDevFixtureUnit(id: string): boolean {
    return DEV_FIXTURE_ROOTS.includes(splitUnitId(id)[0]);
}

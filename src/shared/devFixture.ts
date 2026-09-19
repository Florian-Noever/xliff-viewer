/**
 * Which slice of the fixture corpus the dev-server fixture is built from.
 *
 * Lives in `src/shared/` because two very different things need to agree on it: the
 * webview's committed fixture, and the data test that rebuilds it from
 * `src/test/fixtures/xliff/` and asserts they still match, so the dev server always shows
 * what the extension would send for that file.
 */

export const DEV_FIXTURE_SOURCE = 'Fabrikam Base.de-DE.xlf';

/**
 * Five root objects, chosen for what they cover rather than for being first:
 *
 * - `Codeunit 4184348254` — carries a `maxwidth`, and many units under one object.
 * - `Table 2515662762` and `Page 2515662762` — the **same hash under two object types**,
 *   so the tree has to keep them apart on screen as well as in the model.
 * - `PageExtension 90699051` — four segments deep, and mixes translated with empty.
 * - `PageExtension 1619057625` — mixed states, with `al-object-target` present.
 *
 * Between them: translated and empty units, an empty source, both tree depths, and every
 * optional trans-unit attribute AL emits.
 */
export const DEV_FIXTURE_ROOTS: readonly string[] = [
    'Codeunit 4184348254',
    'Table 2515662762',
    'Page 2515662762',
    'PageExtension 90699051',
    'PageExtension 1619057625',
];

/** True for a unit the fixture includes. */
export function isDevFixtureUnit(id: string): boolean {
    const root = id.split(' - ')[0];
    return DEV_FIXTURE_ROOTS.includes(root);
}

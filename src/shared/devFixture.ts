/**
 * Which slice of `Examples/` the dev-server fixture is built from.
 *
 * Lives in `src/shared/` because two very different things need to agree on it: the
 * webview's committed fixture, and the data test that rebuilds it from `Examples/` and
 * asserts they still match, so the fixture cannot drift into invented data.
 */

export const DEV_FIXTURE_SOURCE = 'Fabrikam Base.de-DE.xlf';

/**
 * Five root objects, chosen for what they cover rather than for being first:
 *
 * - `Codeunit 4282448380` — carries a `maxwidth`, and many units under one object.
 * - `Table 625177701` and `Page 625177701` — the **same hash under two object types**,
 *   so the tree has to keep them apart on screen as well as in the model.
 * - `PageExtension 3644751763` — four segments deep, and mixes translated with empty.
 * - `PageExtension 3007055146` — mixed states, with `al-object-target` present.
 *
 * Between them: translated and empty units, both tree depths, and every optional
 * trans-unit attribute AL emits.
 */
export const DEV_FIXTURE_ROOTS: readonly string[] = [
    'Codeunit 4282448380',
    'Table 625177701',
    'Page 625177701',
    'PageExtension 3644751763',
    'PageExtension 3007055146',
];

/** True for a unit the fixture includes. */
export function isDevFixtureUnit(id: string): boolean {
    const root = id.split(' - ')[0];
    return DEV_FIXTURE_ROOTS.includes(root);
}

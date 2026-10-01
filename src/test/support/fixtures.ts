/**
 * The committed XLIFF corpus, as the node-run test projects read it. The names come from the
 * generator that writes the files, so a test names a fixture by what it is.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { FIXTURE } from '../fixtures/corpus';
import { parseXliff } from '../../extension/xliff/parser';
import { iterateUnits } from '../../shared/model';

import type { XliffTransUnit } from '../../shared/model';

export { FIXTURE };

/** Every fixture, by file name. */
export const FIXTURE_NAMES: readonly string[] = Object.values(FIXTURE);

/** The fixtures in the shape the AL compiler writes: all but the hand-written minimal one. */
export const AL_FIXTURE_NAMES: readonly string[] = FIXTURE_NAMES.filter(name => name !== FIXTURE.minimal);

export const FIXTURE_FOLDER = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));

/** A fixture's text, byte for byte. */
export function readFixture(name: string): string {
    return readFileSync(`${FIXTURE_FOLDER}/${name}`, 'utf8');
}

const unitsByFixture = new Map<string, readonly XliffTransUnit[]>();

/** A fixture's units, parsed once per test file and shared between its tests, so never changed. */
export function fixtureUnits(name: string): readonly XliffTransUnit[] {
    let units = unitsByFixture.get(name);
    if (units === undefined) {
        units = [...iterateUnits(parseXliff(readFixture(name)))];
        unitsByFixture.set(name, units);
    }
    return units;
}

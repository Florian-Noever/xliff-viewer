import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FIXTURE, generateAlSources, generateCorpus } from '../fixtures/corpus';
import { listFiles } from '../support/files';
import { FIXTURE_FOLDER, readFixture } from '../support/fixtures';

const AL_FIXTURES = fileURLToPath(new URL('../fixtures/al', import.meta.url));
const generated = generateCorpus();
const generatedAl = generateAlSources();

/**
 * The data project runs with no mocks at all. This smoke test also pins what every
 * data test depends on: the fixture corpus is reachable and intact.
 */
describe('fixture corpus', () => {
    it('holds exactly the files the generator writes', () => {
        expect(readdirSync(FIXTURE_FOLDER).sort()).toEqual(generated.map(file => file.name).sort());
    });

    it.each(generated.map(file => [file.name, file.text] as const))('%s is exactly what the generator writes', (name, text) => {
        // Compared as a boolean: a failing `toBe` on a megabyte of XML prints all of it.
        expect(readFixture(name) === text, `${name} was edited; regenerate it with UPDATE_FIXTURES=1`).toBe(true);
    });

    it('holds exactly the AL sources the generator writes', () => {
        expect(listFiles(AL_FIXTURES)).toEqual(generatedAl.map(file => file.name).sort());
    });

    it.each(generatedAl.map(file => [file.name, file.text] as const))('%s is exactly what the generator writes', (name, text) => {
        expect(readFileSync(join(AL_FIXTURES, name), 'utf8') === text, `${name} was edited; regenerate it with UPDATE_FIXTURES=1`).toBe(true);
    });

    it('reads the minimal fixture as XLIFF text', () => {
        const text = readFixture(FIXTURE.minimal);
        expect(text).toContain('<xliff');
        expect(text).toContain('<trans-unit id="1">');
    });

    it('sees a BOM on the base file and none on the language file', () => {
        const base = readFixture(FIXTURE.base);
        const language = readFixture(FIXTURE.german);
        expect(base.charCodeAt(0)).toBe(0xfeff);
        expect(language.charCodeAt(0)).not.toBe(0xfeff);
    });
});

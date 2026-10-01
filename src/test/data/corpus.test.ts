import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FIXTURE, generateAlSources, generateCorpus } from '../fixtures/corpus';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const AL_FIXTURES = fileURLToPath(new URL('../fixtures/al', import.meta.url));
const generated = generateCorpus();
const generatedAl = generateAlSources();

/** Every file below a folder, by its path relative to it, with forward slashes. */
function filesBelow(folder: string, prefix = ''): string[] {
    return readdirSync(folder, { withFileTypes: true }).flatMap(entry => (entry.isDirectory()
        ? filesBelow(join(folder, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`]));
}

/**
 * The data project runs with no mocks at all. This smoke test also pins what every
 * data test depends on: the fixture corpus is reachable and intact.
 */
describe('fixture corpus', () => {
    it('holds exactly the files the generator writes', () => {
        expect(readdirSync(FIXTURES).sort()).toEqual(generated.map(file => file.name).sort());
    });

    it.each(generated.map(file => [file.name, file.text] as const))('%s is exactly what the generator writes', (name, text) => {
        // Compared as a boolean: a failing `toBe` on a megabyte of XML prints all of it.
        expect(readFileSync(`${FIXTURES}/${name}`, 'utf8') === text, `${name} was edited; regenerate it with UPDATE_FIXTURES=1`).toBe(true);
    });

    it('holds exactly the AL sources the generator writes', () => {
        expect(filesBelow(AL_FIXTURES).sort()).toEqual(generatedAl.map(file => file.name).sort());
    });

    it.each(generatedAl.map(file => [file.name, file.text] as const))('%s is exactly what the generator writes', (name, text) => {
        expect(readFileSync(join(AL_FIXTURES, name), 'utf8') === text, `${name} was edited; regenerate it with UPDATE_FIXTURES=1`).toBe(true);
    });

    it('reads the minimal fixture as XLIFF text', () => {
        const text = readFileSync(`${FIXTURES}/${FIXTURE.minimal}`, 'utf8');
        expect(text).toContain('<xliff');
        expect(text).toContain('<trans-unit id="1">');
    });

    it('sees a BOM on the base file and none on the language file', () => {
        const base = readFileSync(`${FIXTURES}/${FIXTURE.base}`, 'utf8');
        const language = readFileSync(`${FIXTURES}/${FIXTURE.german}`, 'utf8');
        expect(base.charCodeAt(0)).toBe(0xfeff);
        expect(language.charCodeAt(0)).not.toBe(0xfeff);
    });
});

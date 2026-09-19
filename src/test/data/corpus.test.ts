import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FIXTURE, generateCorpus } from '../fixtures/corpus';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const generated = generateCorpus();

if (process.env.UPDATE_FIXTURES === '1') {
    mkdirSync(FIXTURES, { recursive: true });
    for (const file of generated) {
        writeFileSync(`${FIXTURES}/${file.name}`, file.text, 'utf8');
    }
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

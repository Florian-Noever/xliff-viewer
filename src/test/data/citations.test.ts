import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = new URL('../../../', import.meta.url);
const SELF = fileURLToPath(import.meta.url);

const FOLDERS = ['src', 'media', '.vscode', '.github'];
const ROOT_FILES = ['esbuild.mjs', 'eslint.config.mjs', 'vite.config.mts', 'vitest.config.mts', 'tsconfig.json', 'index.html', 'package.json', '.gitignore'];

const CITATION = /\bDEC-\d{3}\b|\bD-\d{2}\b|§\s?\d|\\u00[aA]7\d|\b(?:TOOL|DATA|TREE|HOST|UI|FIND|NAV|EDIT|POLISH|REVIEW)-\d{2}[a-z]?\b|MASTER_PLAN|ROADMAP|OPEN_QUESTIONS|DECISIONS\.md|STATUS\.md|gob-numberingtool|al-actionimage-viewer/;

function walk(folder: string): string[] {
    return readdirSync(new URL(`${folder}/`, REPO), { withFileTypes: true }).flatMap((entry) => {
        const path = `${folder}/${entry.name}`;
        return entry.isDirectory() ? walk(path) : [path];
    });
}

const scanned = (): string[] => [...FOLDERS.flatMap(walk), ...ROOT_FILES].filter(path => fileURLToPath(new URL(path, REPO)) !== SELF);

function citations(path: string): string[] {
    return readFileSync(new URL(path, REPO), 'utf8')
        .split(/\r?\n/)
        .flatMap((line, index) => (CITATION.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : []));
}

describe('the code cites nothing outside itself', () => {
    it('reads the whole source tree, so a clean scan means something', () => {
        const paths = scanned();

        expect(paths.length).toBeGreaterThan(100);
        expect(paths).toContain('eslint.config.mjs');
        expect(paths).toContain('src/webview/components/UnitCard.vue');
    });

    it('names no planning document, decision, question or task', () => {
        expect(scanned().flatMap(citations)).toEqual([]);
    });
});

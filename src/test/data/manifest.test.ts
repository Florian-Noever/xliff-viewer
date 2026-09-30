import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The manifest as the extension registries read it. The Visual Studio Marketplace takes any string
 * for `qna` and links it as it stands; Open VSX refuses a release whose `qna` is not
 * `marketplace`, `false` or a URL, and whose links are not URLs.
 */

interface Manifest {
    readonly version: string;
    readonly qna?: string | false;
    readonly homepage?: string;
    readonly repository?: { readonly url?: string };
    readonly bugs?: { readonly url?: string };
}

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8')) as Manifest;

const isHttpsUrl = (value: string | undefined): boolean => value !== undefined && URL.canParse(value) && new URL(value).protocol === 'https:';

describe('the manifest, as the registries read it', () => {
    it('points Q&A at a URL, or at one of the two values every registry accepts instead', () => {
        const { qna } = manifest;

        expect(qna === undefined || qna === false || qna === 'marketplace' || isHttpsUrl(qna), `qna: ${String(qna)}`).toBe(true);
    });

    it('links the homepage, the repository and the issues by URL', () => {
        const links = [['homepage', manifest.homepage], ['repository', manifest.repository?.url], ['bugs', manifest.bugs?.url]] as const;

        for (const [field, value] of links) {
            expect(isHttpsUrl(value), `${field}: ${String(value)}`).toBe(true);
        }
    });

    it('carries a version without a prerelease label, which extension versions cannot have', () => {
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

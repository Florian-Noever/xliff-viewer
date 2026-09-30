import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { outlineAl } from '../../extension/al/alOutline';
import { parseXliff } from '../../extension/xliff/parser';
import { iterateUnits } from '../../shared/model';
import { appUnits, translationRoot } from '../fixtures/alApp';
import { Precision, renderApp } from '../fixtures/alRender';
import { CONTOSO_MANIFEST, contosoApp, fabrikamApp, NORTHWIND_MANIFEST } from '../fixtures/corpus';
import { NORTHWIND } from '../fixtures/northwind';

import type { AlDeclaration, AlOutline } from '../../extension/al/alOutline';
import type { AlApp } from '../fixtures/alApp';
import type { AppManifest, RenderedApp } from '../fixtures/alRender';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));

interface Case {
    readonly app: AlApp;
    readonly manifest: AppManifest;
    readonly xliff: string;
}

const CASES: Readonly<Record<string, Case>> = {
    'Contoso App': { app: contosoApp(), manifest: CONTOSO_MANIFEST, xliff: 'Contoso App.g.xlf' },
    'Northwind App': { app: NORTHWIND, manifest: NORTHWIND_MANIFEST, xliff: 'Northwind App.g.xlf' },
    'Fabrikam Base': { app: fabrikamApp(), manifest: CONTOSO_MANIFEST, xliff: 'Fabrikam Base.de-DE.xlf' },
};

const rendered = new Map<string, RenderedApp>(Object.entries(CASES).map(([name, each]) => [name, renderApp(each.app, each.manifest)]));

function renderedOf(name: string): RenderedApp {
    const app = rendered.get(name);
    if (app === undefined) {
        throw new Error(`No rendering of ${name}.`);
    }
    return app;
}

function* walk(declarations: readonly AlDeclaration[]): Generator<AlDeclaration> {
    for (const declaration of declarations) {
        yield declaration;
        yield* walk(declaration.children);
    }
}

/** Where each precision's declaring tokens start, in one outline. */
function declarationStarts(outline: AlOutline): Readonly<Record<string, ReadonlySet<number>>> {
    const exact = new Set<number>();
    const member = new Set<number>();
    const object = new Set<number>();
    for (const declaration of walk(outline.objects)) {
        const start = declaration.name?.range.start;
        if (start !== undefined) {
            (declaration.kind === 'object' ? object : declaration.kind === 'method' ? exact : member).add(start);
        }
        declaration.properties.forEach(property => exact.add(property.name.range.start));
        declaration.variables.forEach(variable => exact.add(variable.name.range.start));
    }
    return { [Precision.exact]: exact, [Precision.member]: member, [Precision.object]: object };
}

describe.each(Object.keys(CASES))('the AL source of %s', (name) => {
    const { app, xliff } = CASES[name];
    const source = renderedOf(name);

    it('declares exactly the units its XLIFF file carries', () => {
        const fileIds = new Set([...iterateUnits(parseXliff(readFileSync(`${FIXTURES}/${xliff}`, 'utf8')))].map(unit => unit.id));

        expect(new Set(appUnits(app).map(unit => unit.id))).toEqual(fileIds);
    });

    it('records where every one of them is declared', () => {
        expect(source.expected.size).toBe(appUnits(app).length);
    });

    it('puts every recorded location on a token the outline reads as a declaration of that precision', () => {
        const texts = new Map(source.files.map(file => [file.path, file.text]));
        const outlines = new Map<string, Readonly<Record<string, ReadonlySet<number>>>>();

        for (const [id, location] of source.expected) {
            let starts = outlines.get(location.file);
            if (starts === undefined) {
                starts = declarationStarts(outlineAl(texts.get(location.file) ?? '', source.symbols));
                outlines.set(location.file, starts);
            }
            expect(starts[location.precision].has(location.offset), `${id} in ${location.file} at ${location.offset}`).toBe(true);
        }
    });
});

describe('the committed AL sources cover what real source does', () => {
    const files = [...renderedOf('Contoso App').files, ...renderedOf('Northwind App').files].filter(file => file.path.endsWith('.al'));
    const count = (pattern: RegExp) => files.filter(file => pattern.test(file.text)).length;
    const expectations = [...renderedOf('Contoso App').expected.values(), ...renderedOf('Northwind App').expected.values()];

    it('in line endings, keyword case and property case', () => {
        expect(count(/\r\n/)).toBeGreaterThan(0);
        expect(count(/^(?!.*\r\n)[\s\S]*\n/)).toBeGreaterThan(0);
        expect(count(/^TABLE |^PAGE |^CODEUNIT /m)).toBeGreaterThan(0);
        expect(count(/^\s+tooltip = /m)).toBeGreaterThan(0);
        expect(count(/trigger on(action|validate)\(\)/)).toBeGreaterThan(0);
    });

    it('in the constructs that trip a naive reader', () => {
        expect(count(/^#if CLEAN/m)).toBeGreaterThan(0);
        expect(count(/\/\/.*\{.*\}/)).toBeGreaterThan(0);
        expect(count(/^\s+\[(ServiceEnabled|Scope\('OnPrem'\))\]/m)).toBeGreaterThan(0);
        expect(files.filter(file => outlineAl(file.text).objects.length > 1).length).toBeGreaterThan(0);
    });

    it('in units the compiler synthesises, which only a member can locate', () => {
        expect(expectations.filter(location => location.precision === Precision.member).length).toBeGreaterThan(1);
    });

    it('in units the compiler files under another object than the one that declares them', () => {
        const folded = appUnits(NORTHWIND).filter(unit => translationRoot(NORTHWIND, unit.declaring) !== unit.declaring);
        const northwind = renderedOf('Northwind App');

        expect(folded.length).toBeGreaterThanOrEqual(4);
        for (const unit of folded) {
            expect(northwind.expected.get(unit.id)?.file, unit.id).toContain(unit.declaring.name.replace(/[^A-Za-z0-9]/g, ''));
        }
    });
});

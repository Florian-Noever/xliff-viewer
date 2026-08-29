import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import { iterateUnits } from '../../shared/model';
import { summariseTree, summariseUnits, XliffState } from '../../shared/state';

import type { AlNodeDto, TransUnitDto, XliffDocumentDto, XliffFileDto } from '../../shared/dto';
import type { UnitState } from '../../shared/state';

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));
const AL_FILES = ['Contoso App.g.xlf', 'Contoso App.en-US.xlf', 'Contoso App.de-DE.xlf', 'Fabrikam Base.de-DE.xlf'];
const CORPUS = [...AL_FILES, 'test.xlf'];

function project(name: string): XliffDocumentDto {
    const text = readFileSync(`${EXAMPLES}/${name}`, 'utf8');
    return projectDocument(parseXliff(text), { uri: `file:///${name}`, fileName: name });
}

function projectXml(xml: string, fileName = 'synthetic.xlf'): XliffDocumentDto {
    return projectDocument(parseXliff(xml), { uri: 'file:///synthetic.xlf', fileName });
}

function* walk(nodes: readonly AlNodeDto[]): Generator<AlNodeDto> {
    for (const node of nodes) {
        yield node;
        yield* walk(node.children);
    }
}

function unitById(file: XliffFileDto, id: string): TransUnitDto {
    const found = file.units.find(unit => unit.id === id);
    if (found === undefined) {
        throw new Error(`no unit "${id}"`);
    }
    return found;
}

const twoFiles = (id: string) => `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="First">
    <body>
      <trans-unit id="${id}"><source>One</source><target state="translated">Eins</target></trans-unit>
    </body>
  </file>
  <file source-language="en-US" target-language="fr-FR" original="Second">
    <body>
      <trans-unit id="${id}"><source>One</source><target state="needs-translation">Un</target></trans-unit>
    </body>
  </file>
</xliff>`;

describe('shape', () => {
    it('gives every corpus file exactly one XliffFileDto', () => {
        for (const name of CORPUS) {
            expect(project(name).files, name).toHaveLength(1);
        }
    });

    it('carries the file metadata the header needs', () => {
        const [file] = project('Fabrikam Base.de-DE.xlf').files;

        expect(file.index).toBe(0);
        expect(file.sourceLanguage).toBe('en-US');
        expect(file.targetLanguage).toBe('de-DE');
        expect(file.original).toBe('Fabrikam Base');
        expect(file.datatype).toBe('xml');
    });

    it('holds no model internals', () => {
        const serialised = JSON.stringify(project('Contoso App.de-DE.xlf'));

        expect(serialised).not.toContain('attributes');
        expect(serialised).not.toContain('hasBom');
        expect(serialised).not.toContain('declaration');
        expect(serialised).not.toContain('"hash"');
        expect(serialised).not.toContain('"depth"');
    });

    it('carries no per-node summary — the webview rolls up', () => {
        const serialised = JSON.stringify(project('Contoso App.de-DE.xlf'));

        expect(serialised).not.toContain('translatedCount');
        expect(serialised).not.toContain('byState');
        expect(serialised).not.toContain('percent');
    });
});

describe('units', () => {
    it('projects every unit of the model exactly once', () => {
        for (const name of CORPUS) {
            const text = readFileSync(`${EXAMPLES}/${name}`, 'utf8');
            const modelIds = [...iterateUnits(parseXliff(text))].map(unit => unit.id);
            const dto = projectDocument(parseXliff(text), { uri: 'file:///x', fileName: name });
            const projected = dto.files.flatMap(file => file.units).map(unit => unit.id);

            expect(projected, name).toEqual(modelIds);
        }
    });

    it('gives every unit exactly one node whose key is its id', () => {
        // The DTO ships no `unitId`: a node carries a unit precisely when its key is one.
        for (const name of CORPUS) {
            for (const file of project(name).files) {
                const keys = [...walk(file.tree)].map(node => node.key);

                expect(new Set(keys).size, name).toBe(keys.length);
                for (const unit of file.units) {
                    expect(keys, `${name} ${unit.id}`).toContain(unit.id);
                }
            }
        }
    });

    it('projects a unit in full', () => {
        const [file] = project('Fabrikam Base.de-DE.xlf').files;
        const unit = unitById(file, 'Codeunit 4282448380 - Method 421560849 - NamedType 3555979353');

        expect(unit).toEqual({
            id: 'Codeunit 4282448380 - Method 421560849 - NamedType 3555979353',
            source: 'none',
            target: 'keine',
            state: XliffState.translated,
            rawState: undefined,
            translate: true,
            maxwidth: 50,
            sizeUnit: 'char',
            alObjectTarget: undefined,
            notes: [{ from: 'Developer', value: 'de-DE=keine|en-US=none' }],
            developerHint: 'keine|en-US=none',
        });
    });

    it('carries al-object-target where the file has one', () => {
        const [file] = project('Fabrikam Base.de-DE.xlf').files;
        const targeted = file.units.filter(unit => unit.alObjectTarget !== undefined);

        expect(targeted.length).toBeGreaterThan(0);
        expect(targeted[0].alObjectTarget).toMatch(/^[A-Za-z]+ \d+$/);
    });

    it('distinguishes an absent target from an empty one', () => {
        const base = project('Contoso App.g.xlf').files[0];
        const language = project('Fabrikam Base.de-DE.xlf').files[0];

        expect(base.units.every(unit => unit.target === undefined)).toBe(true);
        expect(base.units.every(unit => unit.state === XliffState.missing)).toBe(true);

        const emptied = language.units.filter(unit => unit.state === XliffState.empty);
        expect(emptied).toHaveLength(362);
        expect(emptied.every(unit => unit.target === '')).toBe(true);
    });

    it('keeps a raw state the spec does not define, alongside the resolved one', () => {
        const dto = projectXml(`<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en" target-language="de"><body>
  <trans-unit id="1"><source>a</source><target state="proofread">b</target></trans-unit>
  <trans-unit id="2"><source>a</source><target state="translated">b</target></trans-unit>
</body></file></xliff>`);
        const [file] = dto.files;

        expect(unitById(file, '1').state).toBe(XliffState.unknown);
        expect(unitById(file, '1').rawState).toBe('proofread');
        expect(unitById(file, '2').rawState).toBeUndefined();
    });

    it('drops the Xliff Generator note but keeps the Developer one', () => {
        const [file] = project('Fabrikam Base.de-DE.xlf').files;
        const serialised = JSON.stringify(file);

        expect(serialised).not.toContain('Xliff Generator');
        // The names survive, the path they were cut from does not.
        expect(serialised).toContain('SampleMethod6');
        expect(serialised).not.toContain(' - Method SampleMethod6');
        expect(serialised).toContain('"from":"Developer"');
    });

    it('keeps an unprefixed Developer note whole as the hint', () => {
        const dto = projectXml(`<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en" target-language="de"><body>
  <trans-unit id="1"><source>a</source><target>b</target><note from="Developer">%1 = Document No.</note></trans-unit>
</body></file></xliff>`);

        expect(unitById(dto.files[0], '1').developerHint).toBe('%1 = Document No.');
    });

    it('marks a translate="no" unit without hiding it', () => {
        const dto = projectXml(`<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en" target-language="de"><body>
  <trans-unit id="1" translate="no"><source>a</source></trans-unit>
</body></file></xliff>`);

        expect(unitById(dto.files[0], '1').translate).toBe(false);
        expect(dto.files[0].units).toHaveLength(1);
    });
});

describe('several <file> elements', () => {
    it('gives each its own tree and units', () => {
        const dto = projectXml(twoFiles('Table 1 - Property 2'));

        expect(dto.files).toHaveLength(2);
        expect(dto.files.map(file => file.index)).toEqual([0, 1]);
        expect(dto.files.map(file => file.targetLanguage)).toEqual(['de-DE', 'fr-FR']);
        expect(dto.files.every(file => file.tree.length === 1)).toBe(true);
    });

    it('does not lose a unit when two files share an id', () => {
        // XLIFF scopes ids to their <file>; a single document-wide record would drop one
        // of these silently, in the very case DEC-020 exists to support.
        const dto = projectXml(twoFiles('Table 1 - Property 2'));
        const [first, second] = dto.files;

        expect(unitById(first, 'Table 1 - Property 2').state).toBe(XliffState.translated);
        expect(unitById(second, 'Table 1 - Property 2').state).toBe(XliffState.needsTranslation);
    });
});

describe('hasAlIds', () => {
    it('is true for every AL-generated file', () => {
        for (const name of AL_FILES) {
            expect(project(name).files[0].hasAlIds, name).toBe(true);
        }
    });

    it('is false for a file whose ids carry no AL structure', () => {
        expect(project('test.xlf').files[0].hasAlIds).toBe(false);
    });

    it('is true when only some ids are AL-shaped, so the tree is still worth showing', () => {
        const dto = projectXml(`<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en" target-language="de"><body>
  <trans-unit id="1"><source>a</source><target>b</target></trans-unit>
  <trans-unit id="Table 1 - Property 2"><source>a</source><target>b</target></trans-unit>
</body></file></xliff>`);

        expect(dto.files[0].hasAlIds).toBe(true);
    });
});

describe('isBaseFile and readOnly', () => {
    it('recognises a .g.xlf', () => {
        const dto = project('Contoso App.g.xlf');

        expect(dto.isBaseFile).toBe(true);
        expect(dto.readOnly).toBe(true);
    });

    it('does not call a language file a base file just because it translates into its own language', () => {
        // Contoso App.en-US.xlf is en-US → en-US, and every unit has a target.
        const dto = project('Contoso App.en-US.xlf');

        expect(dto.isBaseFile).toBe(false);
        expect(dto.readOnly).toBe(false);
    });

    it('recognises a targetless same-language file that is not named .g.xlf', () => {
        expect(projectXml(`<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="en-US"><body>
  <trans-unit id="1"><source>a</source></trans-unit>
</body></file></xliff>`).isBaseFile).toBe(true);
    });

    it('does not call a freshly synced language file a base file', () => {
        expect(projectXml(`<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en-US" target-language="de-DE"><body>
  <trans-unit id="1"><source>a</source></trans-unit>
</body></file></xliff>`).isBaseFile).toBe(false);
    });

    it('does not call an empty document a base file', () => {
        expect(projectXml(`<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en" target-language="en"><body></body></file></xliff>`).isBaseFile).toBe(false);
    });

    it('lets the caller force read-only on a document that is not a base file', () => {
        const text = readFileSync(`${EXAMPLES}/test.xlf`, 'utf8');
        const dto = projectDocument(parseXliff(text), { uri: 'file:///x', fileName: 'test.xlf', readOnly: true });

        expect(dto.isBaseFile).toBe(false);
        expect(dto.readOnly).toBe(true);
    });

    it('distinguishes an unresolved base file from one that was looked for', () => {
        const text = readFileSync(`${EXAMPLES}/test.xlf`, 'utf8');

        expect(projectDocument(parseXliff(text), { uri: 'file:///x', fileName: 'test.xlf' }).baseFile).toBeUndefined();
        expect(projectDocument(parseXliff(text), { uri: 'file:///x', fileName: 'test.xlf', baseFile: null }).baseFile).toBeNull();
    });
});

describe('the tree it hands over', () => {
    it('is the same shape summariseTree expects', () => {
        const [file] = project('Fabrikam Base.de-DE.xlf').files;
        const states = new Map<string, UnitState>(
            file.units.map(unit => [unit.id, { state: unit.state, translate: unit.translate }]),
        );
        const summaries = summariseTree(file.tree, states);

        expect(summaries.size).toBe(4029);
        const rootTotal = file.tree.reduce((sum, node) => sum + (summaries.get(node.key)?.total ?? 0), 0);
        expect(rootTotal).toBe(2500);
    });

    it('names the nodes it can', () => {
        const [file] = project('Fabrikam Base.de-DE.xlf').files;
        const unnamed = [...walk(file.tree)].filter(node => node.name === undefined);

        expect(unnamed).toHaveLength(0);
    });
});

describe('budget', () => {
    it('serialises the large file inside the §16 payload budget', () => {
        const bytes = Buffer.byteLength(JSON.stringify(project('Fabrikam Base.de-DE.xlf')), 'utf8');

        // 1177 KB measured; 2189 KB with a StateSummary on every node. The point of the
        // assertion is that re-adding them, or the generator note, cannot pass unnoticed.
        expect(bytes).toBeLessThan(1250 * 1024);
    });

});

describe('base-file detection across several files', () => {
    const twoFilesXml = (secondTarget: string) => `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="en-US"><body>
    <trans-unit id="Table 1 - Property 1"><source>One</source></trans-unit>
  </body></file>
  <file source-language="en-US" target-language="en-US"><body>
    <trans-unit id="Table 2 - Property 1"><source>Two</source>${secondTarget}</trans-unit>
  </body></file>
</xliff>`;

    it('is a base file only when no file anywhere carries a target', () => {
        expect(projectXml(twoFilesXml('')).isBaseFile).toBe(true);
    });

    it('is not a base file when one of several files has a target', () => {
        // A single translated unit anywhere means somebody is translating this document.
        expect(projectXml(twoFilesXml('<target state="translated">Zwei</target>')).isBaseFile).toBe(false);
    });

    it('is not a base file when one file translates into another language', () => {
        const mixed = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="en-US"><body>
    <trans-unit id="Table 1 - Property 1"><source>One</source></trans-unit>
  </body></file>
  <file source-language="en-US" target-language="de-DE"><body>
    <trans-unit id="Table 2 - Property 1"><source>Two</source></trans-unit>
  </body></file>
</xliff>`;
        expect(projectXml(mixed).isBaseFile).toBe(false);
    });

    it('trusts the .g.xlf name over the contents', () => {
        expect(projectXml(twoFilesXml('<target state="translated">Zwei</target>'), 'App.g.xlf').isBaseFile).toBe(true);
    });
});

describe('what the header will show', () => {
    // The DTO is the roll-up's only input in the webview, so the figures §5.4 promises
    // have to survive the projection — not merely the model they were measured on.
    const summaryOf = (name: string) => summariseUnits(project(name).files[0].units);

    it('gives Fabrikam Base.de-DE.xlf 86 % and a worst state of empty', () => {
        const summary = summaryOf('Fabrikam Base.de-DE.xlf');

        expect(summary.percent).toBe(86);
        expect(summary.worst).toBe(XliffState.empty);
        expect(summary.total).toBe(2500);
    });

    it('gives a base file 0 % and a worst state of missing', () => {
        const summary = summaryOf('Contoso App.g.xlf');

        expect(summary.percent).toBe(0);
        expect(summary.worst).toBe(XliffState.missing);
    });

    it('rolls the tree up to the same totals the flat summary reports', () => {
        const [file] = project('Fabrikam Base.de-DE.xlf').files;
        const summaries = summariseTree(file.tree, new Map(file.units.map(unit => [unit.id, unit])));

        const roots = file.tree.reduce((sum, node) => sum + (summaries.get(node.key)?.translatedCount ?? 0), 0);

        expect(roots).toBe(summariseUnits(file.units).translatedCount);
    });
});

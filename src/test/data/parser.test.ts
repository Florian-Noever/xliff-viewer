import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { XliffParseError } from '../../extension/xliff/errors';
import { parseXliff } from '../../extension/xliff/parser';
import { validateStructure } from '../../extension/xliff/validate';
import { iterateUnits } from '../../shared/model';

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));
const read = (name: string): string => readFileSync(`${EXAMPLES}/${name}`, 'utf8');
const parse = (name: string) => parseXliff(read(name));
const unitsOf = (name: string) => [...iterateUnits(parse(name))];

const CORPUS = {
    baseFile: 'Contoso App.g.xlf',
    enUs: 'Contoso App.en-US.xlf',
    deDe: 'Contoso App.de-DE.xlf',
    fabrikam: 'Fabrikam Base.de-DE.xlf',
    minimal: 'test.xlf',
} as const;

describe('unit counts', () => {
    it.each([
        [CORPUS.baseFile, 500],
        [CORPUS.enUs, 500],
        [CORPUS.deDe, 500],
        [CORPUS.fabrikam, 2500],
        [CORPUS.minimal, 1],
    ])('%s has %i units', (name, expected) => {
        expect(unitsOf(name)).toHaveLength(expected);
    });

    it('produces a structurally valid model for every corpus file', () => {
        for (const name of Object.values(CORPUS)) {
            expect(() => validateStructure(parse(name)), name).not.toThrow();
        }
    });
});

describe('document format', () => {
    it('reads the base file as BOM + CRLF, with no trailing newline', () => {
        const { format } = parse(CORPUS.baseFile);
        expect(format.hasBom).toBe(true);
        expect(format.eol).toBe('\r\n');
        expect(format.hasTrailingNewline).toBe(false);
        expect(format.declaration).toBe('<?xml version="1.0" encoding="utf-8"?>');
    });

    it('reads a language file as no BOM + LF, and keeps the declaration case', () => {
        const { format } = parse(CORPUS.deDe);
        expect(format.hasBom).toBe(false);
        expect(format.eol).toBe('\n');
        expect(format.hasTrailingNewline).toBe(false);
        // The declaration is kept verbatim, including the case of its encoding name.
        expect(format.declaration).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    });
});

describe('the base file', () => {
    it('has no <target> anywhere — it is the generator output', () => {
        const units = unitsOf(CORPUS.baseFile);
        expect(units.filter(unit => unit.target !== undefined)).toHaveLength(0);
    });

    it('reports source-language equal to target-language', () => {
        const [file] = parse(CORPUS.baseFile).files;
        expect(file.sourceLanguage).toBe('en-US');
        expect(file.targetLanguage).toBe('en-US');
        expect(file.original).toBe('Contoso App');
    });
});

describe('the large language file', () => {
    it('matches the known unit, target and edge-case counts', () => {
        const units = unitsOf(CORPUS.fabrikam);

        const withTarget = units.filter(unit => unit.target !== undefined);
        expect(units).toHaveLength(2500);
        expect(withTarget).toHaveLength(2500);
        expect(withTarget.filter(unit => unit.target?.value === '')).toHaveLength(362);
        expect(units.filter(unit => unit.source === '')).toHaveLength(8);
        expect(withTarget.filter(unit => unit.target?.value === ' ')).toHaveLength(10);
        expect(units.filter(unit => unit.maxwidth !== undefined)).toHaveLength(1);
        expect(units.find(unit => unit.maxwidth !== undefined)?.maxwidth).toBe(50);
    });

    it('records the states the file declares', () => {
        const states = unitsOf(CORPUS.fabrikam)
            .map(unit => unit.target?.state)
            .filter((state): state is string => state !== undefined);
        const counts = states.reduce<Record<string, number>>((acc, state) => {
            acc[state] = (acc[state] ?? 0) + 1;
            return acc;
        }, {});
        expect(counts).toEqual({ translated: 2138, 'needs-translation': 362 });
    });

    it('carries al-object-target on the units that have it', () => {
        expect(unitsOf(CORPUS.fabrikam).filter(unit => unit.alObjectTarget !== undefined)).toHaveLength(656);
    });

});

describe('the minimal, non-AL file', () => {
    it('parses with no namespace and no <group>', () => {
        const document = parse(CORPUS.minimal);
        expect(document.xmlns).toBeUndefined();
        expect(document.version).toBe('1.2');

        const [file] = document.files;
        expect(file.body.groups).toHaveLength(0);
        expect(file.body.units).toHaveLength(1);
        expect(file.sourceLanguage).toBe('en');
        expect(file.targetLanguage).toBe('de');
        expect(file.datatype).toBeUndefined();
    });
});

describe('whitespace is never trimmed', () => {
    const wrap = (unit: string): string =>
        `<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en"><body>${unit}</body></file></xliff>`;

    it('keeps a whitespace-only target as-is', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>x</source><target state="translated">   </target></trans-unit>'));
        expect(doc.files[0].body.units[0].target?.value).toBe('   ');
    });

    it('keeps leading and trailing whitespace on source and target', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>  s  </source><target>  t  </target></trans-unit>'));
        const unit = doc.files[0].body.units[0];
        expect(unit.source).toBe('  s  ');
        expect(unit.target?.value).toBe('  t  ');
    });

    it('keeps a multi-line target', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>x</source><target>one\ntwo</target></trans-unit>'));
        expect(doc.files[0].body.units[0].target?.value).toBe('one\ntwo');
    });
});

describe('the variants the parser must handle', () => {
    const wrap = (inner: string): string =>
        `<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en"><body>${inner}</body></file></xliff>`;

    it('self-closing target: present, empty, state kept', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>x</source><target state="needs-translation"/></trans-unit>'));
        const target = doc.files[0].body.units[0].target;
        expect(target).toBeDefined();
        expect(target?.value).toBe('');
        expect(target?.state).toBe('needs-translation');
    });

    it('target without a state attribute', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>x</source><target>y</target></trans-unit>'));
        expect(doc.files[0].body.units[0].target?.state).toBeUndefined();
    });

    it('no target at all', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>x</source></trans-unit>'));
        expect(doc.files[0].body.units[0].target).toBeUndefined();
    });

    it('self-closing empty source', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source/></trans-unit>'));
        expect(doc.files[0].body.units[0].source).toBe('');
    });

    it('self-closing empty note', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>x</source><note from="Developer" priority="2"/></trans-unit>'));
        const [note] = doc.files[0].body.units[0].notes;
        expect(note.value).toBe('');
        expect(note.from).toBe('Developer');
        expect(note.priority).toBe(2);
    });

    it('several <file> elements', () => {
        const doc = parseXliff(
            '<?xml version="1.0"?>\n<xliff version="1.2">'
            + '<file source-language="en" target-language="de"><body><trans-unit id="a"><source>x</source></trans-unit></body></file>'
            + '<file source-language="en" target-language="fr"><body><trans-unit id="a"><source>y</source></trans-unit></body></file>'
            + '</xliff>'
        );
        expect(doc.files).toHaveLength(2);
        expect(doc.files.map(file => file.targetLanguage)).toEqual(['de', 'fr']);
        expect([...iterateUnits(doc)]).toHaveLength(2);
    });

    it('nested groups', () => {
        const doc = parseXliff(wrap(
            '<group id="outer"><trans-unit id="a"><source>x</source></trans-unit>'
            + '<group id="inner"><trans-unit id="b"><source>y</source></trans-unit></group></group>'
        ));
        const [outer] = doc.files[0].body.groups;
        expect(outer.id).toBe('outer');
        expect(outer.units).toHaveLength(1);
        expect(outer.groups[0].id).toBe('inner');
        expect([...iterateUnits(doc)].map(unit => unit.id)).toEqual(['a', 'b']);
    });

    it('units directly in <body>, alongside a group', () => {
        const doc = parseXliff(wrap(
            '<trans-unit id="loose"><source>x</source></trans-unit>'
            + '<group id="g"><trans-unit id="grouped"><source>y</source></trans-unit></group>'
        ));
        expect(doc.files[0].body.units).toHaveLength(1);
        expect(doc.files[0].body.groups).toHaveLength(1);
        expect([...iterateUnits(doc)].map(unit => unit.id)).toEqual(['loose', 'grouped']);
    });

    it('an unknown state value is kept verbatim, not rejected', () => {
        const doc = parseXliff(wrap('<trans-unit id="a"><source>x</source><target state="needs-coffee">y</target></trans-unit>'));
        expect(doc.files[0].body.units[0].target?.state).toBe('needs-coffee');
    });

    it('translate="no" becomes false; absent means true', () => {
        const doc = parseXliff(wrap(
            '<trans-unit id="a" translate="no"><source>x</source></trans-unit>'
            + '<trans-unit id="b"><source>y</source></trans-unit>'
        ));
        expect(doc.files[0].body.units[0].translate).toBe(false);
        expect(doc.files[0].body.units[1].translate).toBe(true);
    });
});

describe('attributes bag', () => {
    it('keeps the namespace attributes the named fields do not model', () => {
        const document = parse(CORPUS.deDe);
        expect(Object.keys(document.attributes)).toEqual([
            'version',
            'xmlns',
            'xmlns:xsi',
            'xsi:schemaLocation',
        ]);
        // Without these the byte-identical round-trip cannot hold.
        expect(document.attributes['xmlns:xsi']).toBe('http://www.w3.org/2001/XMLSchema-instance');
    });

    it('keeps trans-unit attributes in document order', () => {
        const unit = unitsOf(CORPUS.deDe)[0];
        expect(Object.keys(unit.attributes)).toEqual(['id', 'size-unit', 'translate', 'xml:space']);
    });

    it('populates attributes on every element kind', () => {
        const document = parse(CORPUS.deDe);
        const [file] = document.files;
        const [group] = file.body.groups;
        const unit = group.units[0];

        expect(file.attributes['source-language']).toBe('en-US');
        expect(group.attributes.id).toBe('body');
        expect(unit.target?.attributes.state).toBe('translated');
        expect(unit.notes[0].attributes.from).toBe('Developer');
    });
});

describe('entities', () => {
    it('decodes the predefined entities', () => {
        const unit = unitsOf(CORPUS.fabrikam).find(u => u.source.includes('sig='));
        expect(unit?.source).toContain('&');
        expect(unit?.source).not.toContain('&amp;');
    });

    it('decodes numeric character references', () => {
        const doc = parseXliff(
            '<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en"><body>'
            + '<trans-unit id="a"><source>caf&#233;</source></trans-unit>'
            + '</body></file></xliff>'
        );
        expect(doc.files[0].body.units[0].source).toBe('café');
    });

    it('distinguishes a numeric reference from an escaped ampersand', () => {
        // Without htmlEntities these two produce the *same* model value, so the
        // serialiser cannot tell them apart and corrupts one of them.
        const wrap = (source: string): string =>
            '<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en"><body>'
            + `<trans-unit id="a"><source>${source}</source></trans-unit>`
            + '</body></file></xliff>';

        expect(parseXliff(wrap('caf&#233;')).files[0].body.units[0].source).toBe('café');
        expect(parseXliff(wrap('caf&amp;#233;')).files[0].body.units[0].source).toBe('caf&#233;');
    });
});

describe('cardinality enforced at parse time', () => {
    const wrap = (unit: string): string =>
        `<?xml version="1.0"?>\n<xliff version="1.2"><file source-language="en"><body>${unit}</body></file></xliff>`;

    it('rejects a unit with two <source> elements', () => {
        expect(() => parseXliff(wrap('<trans-unit id="a"><source>x</source><source>y</source></trans-unit>')))
            .toThrow(/2 <source> elements/);
    });

    it('rejects a unit with no <source>', () => {
        expect(() => parseXliff(wrap('<trans-unit id="a"><target>y</target></trans-unit>')))
            .toThrow(/0 <source> elements/);
    });

    it('rejects a unit with two <target> elements', () => {
        expect(() => parseXliff(wrap('<trans-unit id="a"><source>x</source><target>y</target><target>z</target></trans-unit>')))
            .toThrow(/2 <target> elements/);
    });

    it('names the offending unit', () => {
        expect(() => parseXliff(wrap('<trans-unit id="the-culprit"><source>x</source><source>y</source></trans-unit>')))
            .toThrow(/the-culprit/);
    });
});

describe('malformed input', () => {
    it('propagates the validator error rather than parsing on', () => {
        expect(() => parseXliff('<?xml version="1.0"?>\n<xliff><file><body>\n<trans-unit id="a"><source>x</wrong>\n</body></file></xliff>'))
            .toThrow(XliffParseError);
    });

    it('rejects a document with no <xliff> root', () => {
        expect(() => parseXliff('<?xml version="1.0"?>\n<other/>')).toThrow(/no <xliff> root/);
    });
});

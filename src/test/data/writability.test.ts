import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseXliff } from '../../extension/xliff/parser';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));

/** A one-file document whose <body> holds `body`. */
const document = (body: string, beforeBody = ''): string => `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="App">
${beforeBody}    <body>
${body}
    </body>
  </file>
</xliff>
`;

/** A body holding one unit made of `inner`. */
const unit = (inner: string): string => document(`      <trans-unit id="a">\n${inner}\n      </trans-unit>`);

const SOURCE = '        <source>Hello</source>';
const TARGET = '        <target state="translated">Hallo</target>';

const unsupportedIn = (text: string): string | undefined => parseXliff(text).unsupported;

describe('what an edit could not write back', () => {
    it.each([
        ['an XLIFF header', document(`      <trans-unit id="a">\n${SOURCE}\n      </trans-unit>`, '    <header><tool tool-id="ng"/></header>\n'), 'a `<header>` element'],
        ['inline markup in a source', unit('        <source>Hello <x id="INTERPOLATION"/>!</source>'), 'inline markup such as `<x>`'],
        ['inline markup in a target', unit(`${SOURCE}\n        <target><g id="1">Hallo</g></target>`), 'inline markup such as `<g>`'],
        ['inline markup in a note', unit(`${SOURCE}\n        <note>Keep <ph id="1">%1</ph></note>`), 'inline markup such as `<ph>`'],
        ['a context group', unit(`${SOURCE}\n        <context-group><context context-type="sourcefile">app.ts</context></context-group>`), 'a `<context-group>` element'],
        ['an alternative translation', unit(`${SOURCE}\n        <alt-trans><target>Servus</target></alt-trans>`), 'a `<alt-trans>` element'],
        ['an attribute on the source', unit('        <source xml:lang="en-US">Hello</source>'), 'an attribute on `<source>`'],
        ['a comment', unit(`${SOURCE}\n        <!-- checked -->`), 'XML comments'],
        ['a CDATA section', unit('        <source><![CDATA[Hello]]></source>'), 'a CDATA section'],
        ['a processing instruction after the declaration', unit(`${SOURCE}\n        <?review done?>`), 'a processing instruction'],
        ['a DOCTYPE', unit(SOURCE).replace('<xliff', '<!DOCTYPE xliff>\n<xliff'), 'a DOCTYPE'],
        ['a unit after a group', document(`      <group id="g">\n        <trans-unit id="a">\n  ${SOURCE}\n        </trans-unit>\n      </group>\n      <trans-unit id="b">\n${SOURCE}\n      </trans-unit>`), 'a `<trans-unit>` after a `<group>`'],
        ['a note before the target', unit(`${SOURCE}\n        <note>first</note>\n${TARGET}`), 'a `<target>` after a `<note>`'],
        ['stray text in the body', document(`      stray\n      <trans-unit id="a">\n${SOURCE}\n      </trans-unit>`), 'text outside the elements it belongs to'],
    ])('names %s', (_what, text, expected) => {
        expect(unsupportedIn(text)).toBe(expected);
    });

    it('leaves a document of the elements it keeps alone, whatever its layout', () => {
        expect(unsupportedIn(unit(`${SOURCE}\n${TARGET}\n        <note from="Developer">d</note>`))).toBeUndefined();
        expect(unsupportedIn('<xliff version="1.2"><file source-language="en"><body><trans-unit id="a"><source>s</source></trans-unit></body></file></xliff>')).toBeUndefined();
    });

    it.each(readdirSync(FIXTURES).filter(name => name.endsWith('.xlf')))('finds nothing in %s', (name) => {
        expect(unsupportedIn(readFileSync(`${FIXTURES}/${name}`, 'utf8'))).toBeUndefined();
    });
});

describe('inline markup on screen', () => {
    it('reads as the XML it was written as', () => {
        const text = unit('        <source>Hello <x id="INTERPOLATION" equiv-text="{{ name }}"/>!</source>\n        <target>Hallo <g id="1">a &amp; b</g>!</target>');
        const [parsed] = parseXliff(text).files[0].body.units;

        expect(parsed.source).toBe('Hello <x id="INTERPOLATION" equiv-text="{{ name }}"/>!');
        expect(parsed.target?.value).toBe('Hallo <g id="1">a &amp; b</g>!');
    });
});

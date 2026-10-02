import { XMLValidator } from 'fast-xml-parser';

import { XliffParseError } from './errors';
import { iterateFileUnits } from '../../shared/model';

import type { XliffDocument } from '../../shared/model';

/**
 * `XMLParser` recovers silently from an unclosed tag, a mismatched closing tag, a truncated
 * document and an unquoted attribute value. A whole-file writer would rewrite the document
 * from that misreading, so every parse is validated first.
 */

/** A leading BOM confuses the validator's declaration check, so it never reaches it. */
function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** The five named entities XML itself defines. */
const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
/** Markup in which an `&` is not an entity reference: comments, CDATA and processing instructions. */
const OPAQUE_MARKUP = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g;
const NAMED_ENTITY = /&([A-Za-z_:][\w.:-]*);/g;

/**
 * Asserts the text is well-formed XML.
 *
 * @throws {XliffParseError} carrying the line and column the validator reported.
 */
export function validateXml(text: string): void {
    const body = stripBom(text);
    // Returns `true` or an error object; it does not throw.
    const result = XMLValidator.validate(body);
    if (result !== true) {
        const { msg, line, col } = result.err;
        throw new XliffParseError(msg, { line, col });
    }
    rejectUndefinedEntities(body);
}

/**
 * A named entity other than XML's five, such as `&nbsp;`, passes the validator. The parser
 * reads it as literal text, and writing the document back would turn it into `&amp;nbsp;`.
 */
function rejectUndefinedEntities(body: string): void {
    // Blanked rather than removed, so offsets, and with them lines and columns, stay put.
    const masked = body.replace(OPAQUE_MARKUP, markup => markup.replace(/[^\n]/g, ' '));
    for (const match of masked.matchAll(NAMED_ENTITY)) {
        if (XML_ENTITIES.has(match[1])) {
            continue;
        }
        const before = masked.slice(0, match.index);
        throw new XliffParseError(
            `The entity ${match[0]} is not part of XML. Only &amp; &lt; &gt; &quot; and &apos; are, and other characters need a numeric reference such as &#160;.`,
            { line: before.split('\n').length, col: match.index - before.lastIndexOf('\n') },
        );
    }
}

/**
 * Asserts the structure the model layer depends on, after a successful parse. A unit's
 * `<source>` and `<target>` counts are checked by the parser, which a model cannot show.
 *
 * @throws {XliffParseError}
 */
export function validateStructure(document: XliffDocument): void {
    if (document.files.length === 0) {
        throw new XliffParseError('The document contains no <file> element.');
    }

    document.files.forEach((file, index) => {
        // XLIFF 1.2 scopes trans-unit ids to their <file>, not to the document, so
        // uniqueness is checked per file.
        const seen = new Set<string>();

        for (const unit of iterateFileUnits(file)) {
            if (unit.id === '') {
                throw new XliffParseError(`A <trans-unit> in <file> ${index + 1} has no id.`);
            }
            if (seen.has(unit.id)) {
                throw new XliffParseError(
                    `Duplicate <trans-unit> id "${unit.id}" in <file> ${index + 1}; ids must be unique within a file.`
                );
            }
            seen.add(unit.id);
        }
    });
}

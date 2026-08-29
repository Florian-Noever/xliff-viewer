import { XMLValidator } from 'fast-xml-parser';

import { XliffParseError } from './errors';
import { iterateFileUnits } from '../../shared/model';

import type { XliffDocument } from '../../shared/model';

/**
 * Validation is **mandatory, not advisory** (MASTER_PLAN §7.7, `DEC-017`).
 *
 * `XMLParser` recovers silently from malformed input — an unclosed tag, a mismatched
 * closing tag, a truncated document and an unquoted attribute value all parse without
 * complaint. With a whole-file writer that is not a nuisance but data loss: we would
 * rewrite the entire document from a misreading of it.
 */

/** A leading BOM confuses the validator's declaration check, so it never reaches it. */
function stripBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Asserts the text is well-formed XML. Runs **before** every parse — not behind a
 * setting, not skipped for speed.
 *
 * @throws {XliffParseError} carrying the line and column the validator reported.
 */
export function validateXml(text: string): void {
    // Returns `true` or an error object; it does not throw (§7.7 risk note).
    const result = XMLValidator.validate(stripBom(text));
    if (result === true) {
        return;
    }

    const { msg, line, col } = result.err;
    throw new XliffParseError(msg, { line, col });
}

/**
 * Asserts the structure the model layer depends on, after a successful parse.
 *
 * Note what is **not** checked here: "exactly one `<source>` and at most one `<target>`"
 * cannot be verified on the model, because `XliffTransUnit` can only hold one of each —
 * a document with two `<source>` elements produces a model that looks correct. That rule
 * belongs to the parser, at the moment it builds the unit (`DATA-03`).
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

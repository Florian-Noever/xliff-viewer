import { XMLParser } from 'fast-xml-parser';

import { XliffParseError } from './errors';
import { attributesOf, elementsNamed, tagOf, textOf } from './fxpTree';
import { validateXml } from './validate';
import { unsupportedConstruct } from './writability';

import type { FxpNode } from './fxpTree';
import type {
    DocumentFormat,
    Eol,
    XliffAttributes,
    XliffBody,
    XliffDocument,
    XliffFile,
    XliffGroup,
    XliffNote,
    XliffTarget,
    XliffTransUnit,
} from '../../shared/model';

/**
 * Each option is load-bearing:
 *
 * - `preserveOrder` keeps element **and** attribute order, which is what makes the
 *   byte-faithful serialiser possible.
 * - `trimValues: false` honours `xml:space="preserve"`. A target of `'   '` is three
 *   spaces, not an empty string.
 * - `parseTagValue` / `parseAttributeValue: false` stop `"00123"` becoming a number.
 * - `processEntities` + `htmlEntities` together decode both named entities and numeric
 *   character references — see the note below, which is load-bearing.
 *
 * `attributesGroupName` is *not* set: under `preserveOrder` fast-xml-parser always uses
 * `:@` and ignores that option.
 *
 * ## Why `htmlEntities` is required, not optional
 *
 * `processEntities` alone decodes `&amp;` but leaves `&#233;` verbatim. That makes the
 * model **ambiguous**: `caf&#233;` and `caf&amp;#233;` both produce the text
 * `caf&#233;`, so the serialiser cannot tell an é from the literal characters `&#233;`.
 * It escapes the `&`, and the é is silently corrupted into visible `&#233;`.
 *
 * With `htmlEntities` the two become distinct — `café` and `caf&#233;` — and each
 * serialises correctly. The cost is that a numeric reference is written back as the
 * literal character: valid XML, identical meaning, different bytes. Correctness beats
 * byte-identity here.
 *
 * Residual gaps:
 * - `&quot;` / `&apos;` in *text* decode and are written literally, so the first save
 *   changes those bytes.
 * - An **undefined** entity (`&bogus;`) cannot round-trip — it is indistinguishable from
 *   `&amp;bogus;` — but such a document is not well-formed XML in the first place.
 */
const PARSER_OPTIONS = {
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
    htmlEntities: true,
    alwaysCreateTextNode: true,
} as const;

const parser = new XMLParser(PARSER_OPTIONS);

function optional(attributes: XliffAttributes, name: string): string | undefined {
    return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : undefined;
}

// ── document format ──────────────────────────────────────────────────────────

function detectFormat(raw: string): { format: DocumentFormat; body: string } {
    const hasBom = raw.charCodeAt(0) === 0xfeff;
    const body = hasBom ? raw.slice(1) : raw;

    return {
        body,
        format: {
            hasBom,
            declaration: /^<\?xml[^>]*\?>/.exec(body)?.[0] ?? '',
            eol: (body.includes('\r\n') ? '\r\n' : '\n') satisfies Eol,
            hasTrailingNewline: /\r?\n$/.test(body),
        },
    };
}

// ── mapping ──────────────────────────────────────────────────────────────────

function toNote(node: FxpNode): XliffNote {
    const attributes = attributesOf(node);
    const priority = optional(attributes, 'priority');
    const parsed = priority === undefined ? undefined : Number.parseInt(priority, 10);

    return {
        attributes,
        from: optional(attributes, 'from'),
        annotates: optional(attributes, 'annotates'),
        priority: parsed === undefined || Number.isNaN(parsed) ? undefined : parsed,
        value: textOf(node),
    };
}

function toTarget(node: FxpNode): XliffTarget {
    const attributes = attributesOf(node);
    return {
        attributes,
        // Kept verbatim: a value the spec does not define is resolved to `unknown` by
        // the state layer, not rejected here.
        state: optional(attributes, 'state'),
        stateQualifier: optional(attributes, 'state-qualifier'),
        value: textOf(node),
    };
}

function toTransUnit(node: FxpNode): XliffTransUnit {
    const attributes = attributesOf(node);
    const id = optional(attributes, 'id') ?? '';

    // Checked here, not by validateStructure: XliffTransUnit holds one source and one target
    // by construction, so a violation would produce a model that looks correct.
    const sources = elementsNamed(node, 'source');
    const targets = elementsNamed(node, 'target');
    if (sources.length !== 1) {
        throw new XliffParseError(
            `<trans-unit id="${id}"> has ${sources.length} <source> elements; exactly one is required.`
        );
    }
    if (targets.length > 1) {
        throw new XliffParseError(
            `<trans-unit id="${id}"> has ${targets.length} <target> elements; at most one is allowed.`
        );
    }

    const maxwidth = optional(attributes, 'maxwidth');
    const parsedMaxwidth = maxwidth === undefined ? undefined : Number.parseInt(maxwidth, 10);

    return {
        attributes,
        id,
        translate: optional(attributes, 'translate') !== 'no',
        sizeUnit: optional(attributes, 'size-unit'),
        xmlSpace: optional(attributes, 'xml:space'),
        maxwidth: parsedMaxwidth === undefined || Number.isNaN(parsedMaxwidth) ? undefined : parsedMaxwidth,
        alObjectTarget: optional(attributes, 'al-object-target'),
        source: textOf(sources[0]),
        target: targets.length === 1 ? toTarget(targets[0]) : undefined,
        notes: elementsNamed(node, 'note').map(toNote),
    };
}

function toGroup(node: FxpNode): XliffGroup {
    const attributes = attributesOf(node);
    return {
        attributes,
        id: optional(attributes, 'id'),
        groups: elementsNamed(node, 'group').map(toGroup),
        units: elementsNamed(node, 'trans-unit').map(toTransUnit),
    };
}

function toBody(node: FxpNode): XliffBody {
    return {
        attributes: attributesOf(node),
        groups: elementsNamed(node, 'group').map(toGroup),
        // Units may sit directly in <body> without a group.
        units: elementsNamed(node, 'trans-unit').map(toTransUnit),
    };
}

function toFile(node: FxpNode): XliffFile {
    const attributes = attributesOf(node);
    const bodies = elementsNamed(node, 'body');
    if (bodies.length !== 1) {
        throw new XliffParseError(`<file> has ${bodies.length} <body> elements; exactly one is required.`);
    }

    return {
        attributes,
        sourceLanguage: optional(attributes, 'source-language') ?? '',
        targetLanguage: optional(attributes, 'target-language'),
        original: optional(attributes, 'original'),
        datatype: optional(attributes, 'datatype'),
        body: toBody(bodies[0]),
    };
}

/**
 * Parses document text into the model. Validation runs first and its error propagates —
 * a document that is not well-formed is never turned into a model, because a whole-file
 * writer would then rewrite the file from a misreading of it.
 *
 * @throws {XliffParseError} for anything this module rejects. `fast-xml-parser`'s own
 * guards can also surface as a plain `Error` — its nested-tag limit is the reachable one —
 * so a caller must treat any throw as "no model", not only this type.
 */
export function parseXliff(raw: string): XliffDocument {
    validateXml(raw);

    const { body, format } = detectFormat(raw);
    const nodes = parser.parse(body) as FxpNode[];

    const root = nodes.find(node => tagOf(node) === 'xliff');
    if (root === undefined) {
        throw new XliffParseError('The document has no <xliff> root element.');
    }

    const attributes = attributesOf(root);
    return {
        attributes,
        version: optional(attributes, 'version') ?? '',
        xmlns: optional(attributes, 'xmlns'),
        files: elementsNamed(root, 'file').map(toFile),
        format,
        unsupported: unsupportedConstruct(body, format.declaration, root),
    };
}

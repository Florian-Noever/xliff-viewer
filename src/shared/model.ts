/**
 * The raw XLIFF 1.2 model: a mirror of the XML, from which the AL tree is derived and the
 * DTOs are projected. It has **no offsets**: the document is read whole, edited as a model,
 * and written whole.
 *
 * Each element's `attributes` holds every attribute it has, decoded and in document order,
 * so the serialiser writes back the ones no field names — AL puts `xmlns:xsi` and
 * `xsi:schemaLocation` on `<xliff>`. The named fields are read from it. **When writing,
 * update `attributes`.** When reading, use the named field.
 */

/** Attribute name → decoded value, in document order. */
export type XliffAttributes = Readonly<Record<string, string>>;

export type Eol = '\n' | '\r\n';

/**
 * Document facts the serialiser must reproduce exactly. These are observations about the
 * file as it was read, never formatting preferences — do not normalise them.
 */
export interface DocumentFormat {
    readonly hasBom: boolean;
    /** The `<?xml … ?>` declaration verbatim, down to the case of its encoding name. */
    readonly declaration: string;
    readonly eol: Eol;
    readonly hasTrailingNewline: boolean;
}

export interface XliffNote {
    readonly attributes: XliffAttributes;
    readonly from?: string;
    readonly annotates?: string;
    readonly priority?: number;
    /** Never trimmed. */
    readonly value: string;
}

/**
 * Deeply readonly. Editing replaces the whole target on its unit rather than mutating
 * one in place, which keeps `attributes` and `value` from drifting apart.
 */
export interface XliffTarget {
    readonly attributes: XliffAttributes;
    /** The raw `state` attribute, or undefined when absent. May be a value the spec does not define — resolving it to an `XliffState` happens in `state.ts`, not here. */
    readonly state?: string;
    readonly stateQualifier?: string;
    /** Never trimmed. A single space is a legitimate translation. */
    readonly value: string;
}

export interface XliffTransUnit {
    readonly attributes: XliffAttributes;
    readonly id: string;
    /** `translate="no"` → false. Such units are excluded from roll-ups. */
    readonly translate: boolean;
    readonly sizeUnit?: string;
    readonly xmlSpace?: string;
    readonly maxwidth?: number;
    readonly alObjectTarget?: string;
    /** Never trimmed. May be empty. */
    readonly source: string;
    /** Absent when the unit has no `<target>` at all — every unit of a `.g.xlf`. Mutable: this is what edit mode replaces. */
    target?: XliffTarget;
    readonly notes: readonly XliffNote[];
}

export interface XliffGroup {
    readonly attributes: XliffAttributes;
    readonly id?: string;
    /** Nested groups are legal in XLIFF 1.2 even though AL emits one flat `group id="body"`. */
    readonly groups: readonly XliffGroup[];
    readonly units: readonly XliffTransUnit[];
}

export interface XliffBody {
    readonly attributes: XliffAttributes;
    readonly groups: readonly XliffGroup[];
    /** Units may sit directly in `<body>` without a group. */
    readonly units: readonly XliffTransUnit[];
}

export interface XliffFile {
    readonly attributes: XliffAttributes;
    readonly sourceLanguage: string;
    readonly targetLanguage?: string;
    readonly original?: string;
    readonly datatype?: string;
    readonly body: XliffBody;
}

export interface XliffDocument {
    readonly attributes: XliffAttributes;
    readonly version: string;
    readonly xmlns?: string;
    /** XLIFF 1.2 allows several; AL emits exactly one. */
    readonly files: readonly XliffFile[];
    readonly format: DocumentFormat;
    /**
     * Set when the document holds something the model does not keep, so writing it back
     * would lose or move it: a phrase naming the first such thing, such as "XML comments".
     * The serialiser ignores it; the projection makes such a document read-only.
     */
    readonly unsupported?: string;
}

/** A unit is identified by its `<file>` **and** its id — XLIFF scopes ids per file. */
export interface UnitReference {
    readonly fileIndex: number;
    readonly unitId: string;
}

// ── The derived AL view model ────────────────────────────────────────────────
// Everything above mirrors the XML. What follows is derived from trans-unit ids and
// is what the GUI renders; the raw model stays the thing that gets written back.

/** One `<SymbolType> <hash>` step of a trans-unit id. `name` is display text only. */
export interface AlSegment {
    /** An open string — never an enum of allowed AL kinds. */
    readonly type: string;
    /**
     * The numeric hash — as written, or the one AL writes for a readable name. Stable and
     * language-independent; the tree groups by it. Empty on synthetic nodes.
     */
    readonly hash: string;
    /** From a readable id or the generator note; absent when neither supplied one. */
    readonly name?: string;
}

/** A node of the object → member → unit hierarchy. */
export interface AlNode {
    /**
     * Stable identity for expansion state. A node carrying a unit is keyed by that unit's
     * id; any other is keyed by its canonical path, e.g. `Table 2023264910 - Field 1165218225`,
     * or by a synthetic key containing a colon.
     */
    readonly key: string;
    readonly segment: AlSegment;
    readonly depth: number;
    readonly children: readonly AlNode[];
    /** Set on the node a unit lands on — usually a leaf, but an id can also be another's prefix. */
    readonly unitId?: string;
    /** Set on the levels the tree adds above the objects: the type groups and "(no namespace)". */
    readonly synthetic?: true;
}

/** Walks every unit in the document, in file order, across files and nested groups. */
export function* iterateUnits(document: XliffDocument): Generator<XliffTransUnit> {
    for (const file of document.files) {
        yield* iterateFileUnits(file);
    }
}

/**
 * Walks one `<file>`'s units, in document order, through nested groups.
 *
 * Separate from `iterateUnits` because XLIFF scopes trans-unit ids to their `<file>`,
 * so anything checking uniqueness has to work a file at a time.
 */
export function* iterateFileUnits(file: XliffFile): Generator<XliffTransUnit> {
    yield* iterateContainerUnits(file.body);
}

function* iterateContainerUnits(container: XliffBody | XliffGroup): Generator<XliffTransUnit> {
    yield* container.units;
    for (const group of container.groups) {
        yield* iterateContainerUnits(group);
    }
}

/** The unit `reference` names, or undefined when the document has no such `<file>` or no such id in it. */
export function findUnit(document: XliffDocument, reference: UnitReference): XliffTransUnit | undefined {
    const file: XliffFile | undefined = document.files[reference.fileIndex];
    if (file === undefined) {
        return undefined;
    }
    for (const unit of iterateFileUnits(file)) {
        if (unit.id === reference.unitId) {
            return unit;
        }
    }
    return undefined;
}

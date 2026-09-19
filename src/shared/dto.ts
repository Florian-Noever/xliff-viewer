/**
 * The payload the webview receives.
 *
 * A projection, not the model: no `attributes` bags, no `format` record, no offsets, and
 * nothing a webview cannot use. The tree references units by id instead of embedding them,
 * so every unit is serialised exactly once, and nodes carry **no `StateSummary`** — the
 * webview rolls up, so per-node summaries would only inflate the payload.
 *
 * ## Why units live on the file, not the document
 *
 * XLIFF 1.2 scopes a `trans-unit` id to its `<file>`, which is exactly what
 * `validateStructure` enforces. A document-wide collection would let two files' identical
 * ids collide and silently drop units; per-file units also make `XliffFileDto`
 * self-contained.
 *
 * They are an **array in document order**, not a record: a record would repeat every id as
 * a key, and need a parallel array to keep the order.
 */

import type { XliffState } from './state';

/** Trimmed to what the GUI shows: `annotates` and `priority` are constant in practice. */
export interface XliffNoteDto {
    readonly from?: string;
    readonly value: string;
}

export interface TransUnitDto {
    readonly id: string;
    readonly source: string;
    /** Absent when the unit has no `<target>` at all. An empty string is an empty target. */
    readonly target?: string;
    /** Already resolved, synthetic states included — the webview never sees a raw attribute. */
    readonly state: XliffState;
    /** Only when the file declared a `state` the spec does not define, so the GUI can show what it said. */
    readonly rawState?: string;
    /**
     * What the file declared, when that is not what the unit means.
     *
     * `state` is resolved: an empty target is `empty` however finished it claims to be. That
     * resolution is right for the roll-up and loses the file's own words, which the GUI shows
     * and the validation hints need — "empty target whose state claims translated" is not a
     * question `state` can answer. Absent wherever the two agree.
     */
    readonly declaredState?: XliffState;
    readonly translate: boolean;
    readonly maxwidth?: number;
    /**
     * What `maxwidth` counts. Present whenever the file says so — `char` on every AL unit.
     *
     * Shipped rather than assumed: XLIFF 1.2's own default is `pixel`, so guessing `char`
     * from AL's habit would make the width check silently wrong on a non-AL file.
     */
    readonly sizeUnit?: string;
    readonly alObjectTarget?: string;
    /** The `Xliff Generator` note is **not** here — its content is already the node names. */
    readonly notes: readonly XliffNoteDto[];
    /** The text of a `Developer` note, with any `xx-XX=` prefix stripped. */
    readonly developerHint?: string;
    /**
     * True when the base file no longer carries this id — the unit was removed from the AL
     * source and this translation is left over.
     */
    readonly orphaned?: boolean;
    /**
     * The base file's source, when it differs from ours. Its presence *is* the
     * source-changed marker, and it carries the text the reader needs to see.
     */
    readonly baseSource?: string;
}

/**
 * One node of the AL hierarchy, compacted.
 *
 * `hash`, `depth` and `unitId` are all dropped as derivable: the hash is inside `key`,
 * depth is known from the walk, and **a node carries a unit exactly when its `key` is that
 * unit's id** — the tree is built from the ids, so the two are the same string.
 *
 * Structurally satisfies `SummaryNode`, so `summariseTree` runs on it unchanged.
 */
export interface AlNodeDto {
    readonly key: string;
    readonly type: string;
    readonly name?: string;
    readonly children: readonly AlNodeDto[];
    /**
     * Set on the synthetic object-type level, and only there.
     *
     * A flag rather than a key-prefix test on the far side: the key's namespace exists to
     * stop collisions, and making the webview read meaning out of it would turn a private
     * format into a cross-runtime contract. Absent on every real node, so it costs the
     * payload nothing but the handful of groups.
     */
    readonly group?: true;
}

export interface XliffFileDto {
    /** Position in the document — the `<file>` switcher's key. */
    readonly index: number;
    readonly sourceLanguage: string;
    readonly targetLanguage?: string;
    readonly original?: string;
    readonly datatype?: string;
    readonly tree: readonly AlNodeDto[];
    /** Document order, which is display order. Index it by `id` on arrival if you need lookup. */
    readonly units: readonly TransUnitDto[];
    /** False when **no** id parses as `<SymbolType> <hash>` — drives the flat list and its note. */
    readonly hasAlIds: boolean;
}

export interface BaseFileDto {
    readonly uri: string;
    readonly fileName: string;
}

export interface XliffDocumentDto {
    readonly uri: string;
    readonly fileName: string;
    /** A `.g.xlf`, or a file that has no targets at all and translates into its own language. */
    readonly isBaseFile: boolean;
    /** Base files are never editable. Edit mode is a separate, per-view toggle. */
    readonly readOnly: boolean;
    /** Length 1 for every AL-generated file. */
    readonly files: readonly XliffFileDto[];
    /** `null` means resolution ran and found nothing; `undefined` means it has not run. */
    readonly baseFile?: BaseFileDto | null;
}

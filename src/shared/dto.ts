/**
 * The payload the webview receives (MASTER_PLAN §7.5, as corrected by `DEC-028`).
 *
 * A projection, not the model: no `attributes` bags, no `format` record, no offsets, and
 * nothing a webview cannot use. The tree references units by id instead of embedding them,
 * so every unit is serialised exactly once, and nodes carry **no `StateSummary`** — the
 * webview rolls up (`DEC-016`), and per-node summaries made this payload larger than the
 * source file.
 *
 * ## Why units live on the file, not the document
 *
 * §7.5 put a single flat `units` record on the document, commented "ids are
 * document-unique". They are not: XLIFF 1.2 scopes a `trans-unit` id to its `<file>`, which
 * is exactly what `validateStructure` enforces. `DEC-020` made a multi-`<file>` document a
 * supported case, so a flat record would let two files' identical ids collide and silently
 * drop units — in the very scenario the decision exists to serve. Units are therefore
 * per-file (`DEC-028`), which also makes `XliffFileDto` self-contained.
 *
 * They are an **array in document order**, not a record: as a record the ids appeared as
 * keys, again inside each unit, and a third time in a parallel order array — 272 KB of the
 * large corpus file. `DEC-028` has the full accounting, including the reductions refused.
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
    readonly translate: boolean;
    readonly maxwidth?: number;
    readonly alObjectTarget?: string;
    /** The `Xliff Generator` note is **not** here — its content is already the node names (§4.4). */
    readonly notes: readonly XliffNoteDto[];
    /** The text of a `Developer` note, with any `xx-XX=` prefix stripped (§3.7). */
    readonly developerHint?: string;
}

/**
 * One node of the AL hierarchy, compacted.
 *
 * `hash`, `depth` and `unitId` are all dropped as derivable: the hash is inside `key`,
 * depth is known from the walk, and **a node carries a unit exactly when its `key` is that
 * unit's id** — the tree is built from the ids, so the two are the same string. Shipping
 * `unitId` cost 155 KB of the large file's payload to repeat `key`.
 *
 * Structurally satisfies `SummaryNode`, so `summariseTree` runs on it unchanged.
 */
export interface AlNodeDto {
    readonly key: string;
    readonly type: string;
    readonly name?: string;
    readonly children: readonly AlNodeDto[];
}

export interface XliffFileDto {
    /** Position in the document — the `<file>` switcher's key (`DEC-020`). */
    readonly index: number;
    readonly sourceLanguage: string;
    readonly targetLanguage?: string;
    readonly original?: string;
    readonly datatype?: string;
    readonly tree: readonly AlNodeDto[];
    /** Document order, which is display order. Index it by `id` on arrival if you need lookup. */
    readonly units: readonly TransUnitDto[];
    /** False when **no** id parses as `<SymbolType> <hash>` — drives the flat list and its note (`DEC-022`). */
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
    /** Base files are never editable (`DEC-011`). Edit mode is a separate, per-view toggle. */
    readonly readOnly: boolean;
    /** Length 1 for every AL-generated file. */
    readonly files: readonly XliffFileDto[];
    /** `null` means resolution ran and found nothing; `undefined` means it has not run. */
    readonly baseFile?: BaseFileDto | null;
}

/**
 * The payload the webview receives: a projection of the model, holding what the webview shows.
 *
 * The tree names units by id. The units themselves live on their `<file>`, in document
 * order, because XLIFF 1.2 scopes a `trans-unit` id to its `<file>`.
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
     * The state the file declared, when `state` resolved it to something else: an empty
     * target is `empty` whatever it declares. Absent wherever the two agree.
     */
    readonly declaredState?: XliffState;
    readonly translate: boolean;
    readonly maxwidth?: number;
    /** What `maxwidth` counts, when the file says: `char` on every AL unit. XLIFF 1.2's default is `pixel`. */
    readonly sizeUnit?: string;
    readonly alObjectTarget?: string;
    /** The `Xliff Generator` note is **not** here — its content is already the node names. */
    readonly notes: readonly XliffNoteDto[];
    /** What the `Developer` note suggests for this file's target language, when it suggests anything. */
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
 * One node of the AL hierarchy. **A node carries a unit exactly when its `key` is that
 * unit's id**; the segment's hash is part of the key.
 *
 * Structurally a `SummaryNode`, so `summariseTree` runs on it unchanged.
 */
export interface AlNodeDto {
    readonly key: string;
    readonly type: string;
    readonly name?: string;
    readonly children: readonly AlNodeDto[];
    /**
     * Set on the levels the tree adds above the objects — object-type groups and
     * "(no namespace)" — and only there. The webview reads this flag, never the key's format.
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
    /**
     * Set when the ids name namespaces, so the tree's top level is namespaces with type
     * groups inside them — one level more above the objects than a file without.
     */
    readonly namespaced?: true;
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
    /**
     * Base files are never editable, nor is a file this editor could not write back without
     * losing something. Edit mode is a separate, per-view toggle.
     */
    readonly readOnly: boolean;
    /** Why the file cannot be edited, as a sentence for the reader. Set exactly when `readOnly` is. */
    readonly readOnlyReason?: string;
    /** Length 1 for every AL-generated file. */
    readonly files: readonly XliffFileDto[];
    /** `null` means resolution ran and found nothing; `undefined` means it has not run. */
    readonly baseFile?: BaseFileDto | null;
}

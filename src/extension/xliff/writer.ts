import { UnknownUnitError } from './errors';
import { serialiseXliff } from './serialise';
import { findUnit } from '../../shared/model';

import type { UnitReference, XliffDocument, XliffTransUnit } from '../../shared/model';

/**
 * Model mutation → the smallest text edit that expresses it.
 *
 * The order is fixed: **mutate the model, serialise the whole document, then trim.**
 * Serialising everything and narrowing afterwards is what keeps the writer honest — it
 * cannot produce an edit the serialiser would not also produce, so the serialiser's
 * round-trip invariant covers the write path too.
 *
 * No `vscode` import: this returns plain character offsets and the host converts them
 * with `document.positionAt`.
 */

/** A replacement of `[start, end)` in the current text. Offsets are UTF-16 code units. */
export interface TextEditRange {
    readonly start: number;
    readonly end: number;
    readonly newText: string;
}

export interface SetTargetIntent extends UnitReference {
    readonly value: string;
    /** Omitted leaves the existing state untouched; on a new target it means no attribute. */
    readonly state?: string;
}

function isHighSurrogate(code: number): boolean {
    return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Narrows a whole-document rewrite to the region that actually changed.
 *
 * Returns `null` when nothing changed — that is what stops a file whose formatting does
 * not match ours from being rewritten merely by being opened.
 */
export function trimToEdit(currentText: string, nextText: string): TextEditRange | null {
    if (currentText === nextText) {
        return null;
    }

    const limit = Math.min(currentText.length, nextText.length);
    let start = 0;
    while (start < limit && currentText.charCodeAt(start) === nextText.charCodeAt(start)) {
        start++;
    }
    // Never split a surrogate pair: the host turns these offsets into positions, and a
    // position between two halves of one character is not a valid position.
    if (start > 0 && isHighSurrogate(currentText.charCodeAt(start - 1))) {
        start--;
    }

    let endCurrent = currentText.length;
    let endNext = nextText.length;
    while (
        endCurrent > start
        && endNext > start
        && currentText.charCodeAt(endCurrent - 1) === nextText.charCodeAt(endNext - 1)
    ) {
        endCurrent--;
        endNext--;
    }
    if (endCurrent < currentText.length && isHighSurrogate(currentText.charCodeAt(endCurrent - 1))) {
        endCurrent++;
        endNext++;
    }

    return { start, end: endCurrent, newText: nextText.slice(start, endNext) };
}

function requireUnit(document: XliffDocument, reference: UnitReference): XliffTransUnit {
    const unit = findUnit(document, reference);
    if (unit === undefined) {
        throw new UnknownUnitError(reference);
    }
    return unit;
}

/**
 * Writes a target into the model and returns the edit that expresses it, or `null` when
 * the document text would be unchanged.
 *
 * The target is **replaced**, never mutated in place, so its `attributes` bag and its
 * named fields cannot drift apart. A unit with no `<target>` gains one; the serialiser
 * places it after `<source>` and indents it, so there is no insertion point to compute here.
 *
 * @throws {UnknownUnitError} when the document has no such unit.
 */
export function setTarget(
    document: XliffDocument,
    currentText: string,
    intent: SetTargetIntent,
): TextEditRange | null {
    const unit = requireUnit(document, intent);
    const existing = unit.target;

    const state = intent.state ?? existing?.state;
    const attributes: Record<string, string> = { ...existing?.attributes };
    if (state === undefined) {
        delete attributes.state;
    } else {
        attributes.state = state;
    }

    const previous = unit.target;
    unit.target = {
        attributes,
        state,
        stateQualifier: existing?.stateQualifier,
        value: intent.value,
    };

    const edit = trimToEdit(currentText, serialiseXliff(document));
    if (edit === null) {
        // Nothing changed in the text, so leave the model exactly as it was rather than
        // holding a freshly built but equivalent target object.
        unit.target = previous;
    }
    return edit;
}

/**
 * Captures a unit's target as it is now and returns what puts it back: the write path's way
 * back when the editor refuses an edit the model already holds. A no-op for a unit the
 * document does not have.
 */
export function rememberTarget(document: XliffDocument, reference: UnitReference): () => void {
    const unit = findUnit(document, reference);
    if (unit === undefined) {
        return () => { };
    }
    const target = unit.target;
    return () => {
        unit.target = target;
    };
}

/** Changes only the state, leaving the target text alone. */
export function setState(
    document: XliffDocument,
    currentText: string,
    reference: UnitReference,
    state: string,
): TextEditRange | null {
    const unit = requireUnit(document, reference);
    return setTarget(document, currentText, { fileIndex: reference.fileIndex, unitId: reference.unitId, value: unit.target?.value ?? '', state });
}

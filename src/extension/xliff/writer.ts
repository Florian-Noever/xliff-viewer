import { XliffParseError } from './errors';
import { serialiseXliff } from './serialise';
import { iterateUnits } from '../../shared/model';

import type { XliffDocument, XliffTransUnit } from '../../shared/model';

/**
 * Model mutation → the smallest text edit that expresses it (MASTER_PLAN §7.6).
 *
 * The order is fixed: **mutate the model, serialise the whole document, then trim.**
 * Serialising everything and narrowing afterwards is what keeps the writer honest — it
 * cannot produce an edit the serialiser would not also produce, so `DATA-04`'s
 * round-trip invariant covers the write path too.
 *
 * No `vscode` import: this returns plain character offsets and the host converts them
 * with `document.positionAt` (§6.1).
 */

/** A replacement of `[start, end)` in the current text. Offsets are UTF-16 code units. */
export interface TextEditRange {
    readonly start: number;
    readonly end: number;
    readonly newText: string;
}

export interface SetTargetIntent {
    readonly unitId: string;
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
 * not match ours from being rewritten merely by being opened (§7.6).
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

function findUnit(document: XliffDocument, unitId: string): XliffTransUnit {
    for (const unit of iterateUnits(document)) {
        if (unit.id === unitId) {
            return unit;
        }
    }
    throw new XliffParseError(`No <trans-unit> with id "${unitId}" in this document.`);
}

/**
 * Writes a target into the model and returns the edit that expresses it, or `null` when
 * the document text would be unchanged.
 *
 * The target is **replaced**, never mutated in place, so its `attributes` bag and its
 * named fields cannot drift apart (`DEC-025`). A unit with no `<target>` gains one; the
 * serialiser places it after `<source>` and indents it, so there is no insertion point to
 * compute here.
 *
 * @throws {XliffParseError} when no unit has that id.
 */
export function setTarget(
    document: XliffDocument,
    currentText: string,
    intent: SetTargetIntent,
): TextEditRange | null {
    const unit = findUnit(document, intent.unitId);
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

/** Changes only the state, leaving the target text alone. */
export function setState(
    document: XliffDocument,
    currentText: string,
    unitId: string,
    state: string,
): TextEditRange | null {
    const unit = findUnit(document, unitId);
    return setTarget(document, currentText, { unitId, value: unit.target?.value ?? '', state });
}

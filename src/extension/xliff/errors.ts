import type { UnitReference } from '../../shared/model';

/** Position within the document, as reported by the XML validator. 1-based. */
export interface XliffErrorPosition {
    readonly line?: number;
    readonly col?: number;
}

/**
 * Raised when a document cannot be trusted — either it is not well-formed XML, or it
 * lacks structure the model layer depends on.
 *
 * A document that produces this is **never written**: with a whole-file writer, acting
 * on a misreading would rewrite the entire file from it.
 */
export class XliffParseError extends Error {
    public override readonly name = 'XliffParseError';
    public readonly line: number | undefined;
    public readonly col: number | undefined;

    public constructor(message: string, position: XliffErrorPosition = {}) {
        super(message);
        this.line = position.line;
        this.col = position.col;
    }

    /** `"message (line 12, column 5)"` — what the GUI's error pane shows. */
    public get displayMessage(): string {
        if (this.line === undefined) {
            return this.message;
        }
        const column = this.col === undefined ? '' : `, column ${this.col}`;
        return `${this.message} (line ${this.line}${column})`;
    }
}

/** Raised when an edit names a unit the document does not have. */
export class UnknownUnitError extends Error {
    public override readonly name = 'UnknownUnitError';
    public readonly fileIndex: number;
    public readonly unitId: string;

    public constructor(reference: UnitReference) {
        super(`No <trans-unit> with id "${reference.unitId}" in <file> ${reference.fileIndex + 1}.`);
        this.fileIndex = reference.fileIndex;
        this.unitId = reference.unitId;
    }
}

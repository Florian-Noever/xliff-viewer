import { GAP, PAD, FONT_SIZE, ROW_INDENT, ROW_HEIGHT, FIELD_MAX_COLUMNS } from '../constants';

/** Injects the shared layout numbers from constants.ts as CSS custom properties on <html>. */
export function useDesignTokens(): void {
    const root = document.documentElement;
    root.style.setProperty('--gap', `${GAP}px`);
    root.style.setProperty('--pad', `${PAD}px`);
    root.style.setProperty('--font', `${FONT_SIZE}px`);
    root.style.setProperty('--row-indent', `${ROW_INDENT}px`);
    root.style.setProperty('--row-height', `${ROW_HEIGHT}px`);
    root.style.setProperty('--field-max-inline', `${FIELD_MAX_COLUMNS}ch`);
}

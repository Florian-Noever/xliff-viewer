/**
 * Single source of truth for every number shared between TypeScript logic and CSS.
 * `useDesignTokens()` injects these as CSS custom properties. Values with no TypeScript
 * consumer, such as radii, live in global.css.
 */

// --- Layout ---
export const GAP = 12;
export const PAD = 10;
export const FONT_SIZE = 13;

// --- Tree ---
export const ROW_INDENT = 16;
export const ROW_HEIGHT = 24;

// --- Unit card ---
/** Narrow enough that a one-word caption gets a small target field, wide enough to type into. */
export const FIELD_MIN_COLUMNS = 24;
/** The widest a target field grows, from its source or from what is typed into it. */
export const FIELD_MAX_COLUMNS = 72;

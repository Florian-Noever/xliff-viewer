/**
 * Single source of truth for every number shared between TypeScript logic and CSS.
 * `useDesignTokens()` injects these as CSS custom properties. Values with no TypeScript
 * consumer — radii, z-layers, durations — live in global.css.
 */

// --- Layout ---
export const GAP = 12;
export const PAD = 10;
export const FONT_SIZE = 13;

// --- Tree ---
export const ROW_INDENT = 16;
export const ROW_HEIGHT = 24;

// --- Domain ---
/** The `from` value AL writes on a translator note. */
export const DEVELOPER_NOTE = 'Developer';

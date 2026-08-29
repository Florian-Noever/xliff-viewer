/**
 * Single source of truth for every number shared between TypeScript logic and CSS
 * (MASTER_PLAN §11.6). `useDesignTokens()` injects these as CSS custom properties.
 * Values with no TypeScript consumer — radii, z-layers, durations — live in global.css.
 */

// --- Layout ---
export const GAP = 12;
export const PAD = 10;
export const FONT_SIZE = 13;

// --- Tree ---
export const ROW_INDENT = 16;
export const ROW_HEIGHT = 24;

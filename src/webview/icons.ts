import chevronDown from '@vscode/codicons/src/icons/chevron-down.svg?raw';
import chevronRight from '@vscode/codicons/src/icons/chevron-right.svg?raw';
import close from '@vscode/codicons/src/icons/close.svg?raw';

/**
 * Codicon markup, inlined at build time.
 *
 * The SVGs ship with `fill="currentColor"`, so an icon takes the colour of whatever it
 * sits in and needs no theming of its own. Importing the font instead would cost a webfont
 * request the CSP would have to allow, for glyphs we can inline in a few hundred bytes.
 */
export const Icon = {
    chevronDown,
    chevronRight,
    close,
} as const;
export type Icon = typeof Icon[keyof typeof Icon];

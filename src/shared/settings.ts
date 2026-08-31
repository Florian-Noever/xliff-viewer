/**
 * The settings both runtimes need to agree on (MASTER_PLAN §13).
 *
 * The keys live here so the host reads and the webview consumes the same names; the
 * reading itself is `src/extension/services/settings.ts`, which is the only place allowed
 * to touch `workspace.getConfiguration`.
 */

import { XliffState } from './state';

export const SETTINGS_SECTION = 'xliffViewer';

/** Every §13 key, unqualified. `validation.enabled` really does contain a dot. */
export const SettingKey = {
    baseFile: 'baseFile',
    editMode: 'editMode',
    stateOnEdit: 'stateOnEdit',
    showDeveloperNotes: 'showDeveloperNotes',
    showGeneratorNotes: 'showGeneratorNotes',
    defaultExpandDepth: 'defaultExpandDepth',
    validationEnabled: 'validation.enabled',
    validationSameAsSource: 'validation.sameAsSource',
} as const;
export type SettingKey = typeof SettingKey[keyof typeof SettingKey];

/**
 * The subset the webview is told about.
 *
 * `baseFile` and `stateOnEdit` are absent on purpose: resolution and write-back both
 * happen in the host, and shipping them would invite the webview to act on them.
 */
export interface WebviewSettings {
    readonly editMode: boolean;
    readonly showDeveloperNotes: boolean;
    readonly showGeneratorNotes: boolean;
    readonly defaultExpandDepth: number;
    readonly validationEnabled: boolean;
    /**
     * Its own key rather than a case of `validationEnabled`, because §12.4 calls this hint
     * weak and wants it off (`DEC-037`). It is right about 132 of the corpus's translated
     * units — proper nouns and identifiers a translator left alone on purpose.
     */
    readonly validationSameAsSource: boolean;
}

/** Mirrors the `package.json` defaults; used when the webview renders before the host speaks. */
export const DEFAULT_WEBVIEW_SETTINGS: WebviewSettings = {
    editMode: false,
    showDeveloperNotes: true,
    showGeneratorNotes: false,
    defaultExpandDepth: 1,
    validationEnabled: true,
    validationSameAsSource: false,
};

export const DEFAULT_STATE_ON_EDIT = XliffState.translated;

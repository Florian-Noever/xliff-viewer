import { afterEach, describe, expect, it } from 'vitest';

import { affectsSettings, readSettings, toWebviewSettings } from '../../extension/services/settings';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { XliffState } from '../../shared/state';
import { resetMocks, setConfigOverride } from '../__mocks__/vscode';

import type { ConfigurationChangeEvent } from '../__mocks__/vscode';

afterEach(() => {
    resetMocks();
});

const changeEvent = (...sections: string[]): ConfigurationChangeEvent => ({
    affectsConfiguration: (section: string) => sections.some(changed => changed === section || changed.startsWith(`${section}.`)),
});

describe('readSettings', () => {
    it('falls back to the package.json defaults when nothing is set', () => {
        expect(readSettings()).toEqual({
            ...DEFAULT_WEBVIEW_SETTINGS,
            baseFile: '',
            stateOnEdit: XliffState.translated,
        });
    });

    it('reads every §13 key', () => {
        setConfigOverride('xliffViewer.baseFile', 'Translations/*.g.xlf');
        setConfigOverride('xliffViewer.editMode', true);
        setConfigOverride('xliffViewer.stateOnEdit', 'signed-off');
        setConfigOverride('xliffViewer.showDeveloperNotes', false);
        setConfigOverride('xliffViewer.showGeneratorNotes', true);
        setConfigOverride('xliffViewer.defaultExpandDepth', 3);
        setConfigOverride('xliffViewer.validation.enabled', false);

        expect(readSettings()).toEqual({
            baseFile: 'Translations/*.g.xlf',
            editMode: true,
            stateOnEdit: XliffState.signedOff,
            showDeveloperNotes: false,
            showGeneratorNotes: true,
            defaultExpandDepth: 3,
            validationEnabled: false,
        });
    });

    it('ignores a value of the wrong type rather than passing it on', () => {
        // package.json declares the types, but a user can hand-edit settings.json.
        setConfigOverride('xliffViewer.editMode', 'yes');
        setConfigOverride('xliffViewer.baseFile', 7);
        setConfigOverride('xliffViewer.defaultExpandDepth', 'deep');

        const settings = readSettings();

        expect(settings.editMode).toBe(false);
        expect(settings.baseFile).toBe('');
        expect(settings.defaultExpandDepth).toBe(1);
    });

    it('refuses a state the spec does not define', () => {
        // Only the ten writable states; a synthetic one would be written into the file.
        setConfigOverride('xliffViewer.stateOnEdit', 'empty');
        expect(readSettings().stateOnEdit).toBe(XliffState.translated);

        setConfigOverride('xliffViewer.stateOnEdit', 'proofread');
        expect(readSettings().stateOnEdit).toBe(XliffState.translated);
    });

    it('clamps the expand depth to a whole, non-negative number', () => {
        setConfigOverride('xliffViewer.defaultExpandDepth', -4);
        expect(readSettings().defaultExpandDepth).toBe(0);

        setConfigOverride('xliffViewer.defaultExpandDepth', 2.7);
        expect(readSettings().defaultExpandDepth).toBe(2);

        setConfigOverride('xliffViewer.defaultExpandDepth', Number.NaN);
        expect(readSettings().defaultExpandDepth).toBe(1);
    });
});

describe('toWebviewSettings', () => {
    it('keeps baseFile and stateOnEdit in the host', () => {
        setConfigOverride('xliffViewer.baseFile', 'Base.g.xlf');
        setConfigOverride('xliffViewer.stateOnEdit', 'final');

        const forWebview = toWebviewSettings(readSettings());

        expect(forWebview).toEqual(DEFAULT_WEBVIEW_SETTINGS);
        expect(JSON.stringify(forWebview)).not.toContain('Base.g.xlf');
        expect(JSON.stringify(forWebview)).not.toContain('final');
    });
});

describe('affectsSettings', () => {
    it('is true for any key in our section', () => {
        expect(affectsSettings(changeEvent('xliffViewer.editMode'))).toBe(true);
        expect(affectsSettings(changeEvent('xliffViewer.validation.enabled'))).toBe(true);
    });

    it('is false for someone else\'s settings', () => {
        expect(affectsSettings(changeEvent('editor.fontSize', 'xliffSync.baseFile'))).toBe(false);
    });
});

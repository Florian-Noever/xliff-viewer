import { describe, expect, it } from 'vitest';

import { translationLabel, translations } from '../../webview/translations';
import { XliffState } from '../../shared/state';
import { exampleUnitDto } from '../support/dtoBuilders';

describe('translations()', () => {
    it('returns exactly one entry, carrying the language, the value and the state', () => {
        expect(translations(exampleUnitDto(), 'de-DE')).toEqual([{ language: 'de-DE', value: 'ExampleTranslation', state: XliffState.translated }]);
    });

    it('keeps an absent target absent rather than turning it into an empty string', () => {
        expect(translations(exampleUnitDto({ target: undefined }), 'de-DE')[0].value).toBeUndefined();
    });

    it('carries no language when the file declares none', () => {
        expect(translations(exampleUnitDto())[0].language).toBeUndefined();
    });

    it('labels a row with the language in brackets, or the plain word without one', () => {
        expect(translationLabel({ language: 'fr-FR', state: XliffState.translated })).toBe('[ fr-FR ]');
        expect(translationLabel({ state: XliffState.translated })).toBe('target');
    });
});

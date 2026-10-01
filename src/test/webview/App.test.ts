import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { ExtensionMessageType } from '../../shared/messages';
import { clearPostedMessages, postedMessages } from '../setup/webview';
import { documentDto, fileDto, unitDto } from '../support/dtoBuilders';
import { mountApp, receive } from './support/mountApp';

const DOCUMENT = documentDto([fileDto({
    original: 'Contoso-Base',
    units: [
        unitDto('1', { source: 'Customer', target: 'Kunde' }),
        unitDto('2', { source: 'Vendor', target: '', state: 'empty' }),
    ],
})], { uri: 'file:///w/Contoso-Base.de-DE.xlf', fileName: 'Contoso-Base.de-DE.xlf' });

describe('before a document arrives', () => {
    it('says so rather than rendering an empty shell', () => {
        expect(mountApp().text()).toContain('Waiting for a document');
    });

    it('posts exactly one ready on mount', () => {
        clearPostedMessages();
        mountApp();
        expect(postedMessages).toEqual([{ type: 'ready' }]);
    });

    it('injects the design tokens onto the document element', () => {
        mountApp();
        expect(document.documentElement.style.getPropertyValue('--gap')).toBe('12px');
        expect(document.documentElement.style.getPropertyValue('--row-height')).toBe('24px');
    });
});

describe('the file header', () => {
    it('names the file, both languages and the unit count', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        expect(wrapper.text()).toContain('Contoso-Base.de-DE.xlf');
        expect(wrapper.text()).toContain('en-US');
        expect(wrapper.text()).toContain('de-DE');
        expect(wrapper.text()).toContain('2 units');
    });

    it('counts a file of one unit in the singular', async () => {
        const [file] = DOCUMENT.files;
        const wrapper = mountApp({ ...DOCUMENT, files: [{ ...file, units: file.units.slice(0, 1) }] });
        await nextTick();

        expect(wrapper.get('.count').text()).toBe('1 unit');
    });

    it('titles the header with the app, and puts the file name beneath it', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();

        expect(wrapper.get('.app-name').text()).toBe('Contoso-Base');
        expect(wrapper.get('.file-name').text()).toBe('Contoso-Base.de-DE.xlf');
    });

    it('keeps the file name as the title when the file declares no app', async () => {
        // `original` is optional in XLIFF. A blank heading would be worse than a repeated name.
        const wrapper = mountApp({
            ...DOCUMENT,
            files: [{ ...DOCUMENT.files[0], original: undefined }],
        });
        await nextTick();

        expect(wrapper.get('.app-name').text()).toBe('Contoso-Base.de-DE.xlf');
        expect(wrapper.find('.file-name').exists()).toBe(false);
    });

    it('marks a read-only document, so nobody wonders why editing is absent', async () => {
        const wrapper = mountApp({ ...DOCUMENT, isBaseFile: true, readOnly: true });
        await nextTick();
        expect(wrapper.get('.tag').text()).toBe('base file · read-only');
    });

    it('says only "read-only" for a language file that cannot be written, and why on hover', async () => {
        const wrapper = mountApp({ ...DOCUMENT, readOnly: true, readOnlyReason: 'This file is read-only.' });
        await nextTick();
        expect(wrapper.get('.tag').text()).toBe('read-only');
        expect(wrapper.get('.tag').attributes('title')).toBe('This file is read-only.');
    });

    it('shows the file-level percentage', async () => {
        // One translated of two translatable is 50 %.
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        expect(wrapper.get('.percent').text()).toBe('50 %');
    });

    it('does not mark an editable one', async () => {
        const wrapper = mountApp(DOCUMENT);
        await nextTick();
        expect(wrapper.find('.tag').exists()).toBe(false);
    });

    it('shows a dash for a file with no target language', async () => {
        const [file] = DOCUMENT.files;
        const wrapper = mountApp({
            ...DOCUMENT,
            files: [{ index: 0, sourceLanguage: file.sourceLanguage, tree: [], units: file.units, hasAlIds: false }],
        });
        await nextTick();

        expect(wrapper.get('.languages').text()).toBe('en-US → —');
    });
});

describe('failure', () => {
    const error = { type: ExtensionMessageType.error, payload: { message: 'Unclosed tag', line: 12, col: 5 } } as const;

    it('takes the whole view when nothing has ever parsed', async () => {
        const wrapper = mountApp();

        receive(error);
        await nextTick();

        expect(wrapper.get('.status-pane').classes()).toContain('pane');
        expect(wrapper.text()).toContain('Line 12, column 5');
        expect(wrapper.text()).not.toContain('Waiting for a document');
    });

    it('leaves the document readable behind a banner', async () => {
        const wrapper = mountApp(DOCUMENT);
        receive(error);
        await nextTick();

        expect(wrapper.get('.status-pane').classes()).toContain('banner');
        expect(wrapper.text()).toContain('Unclosed tag');
        expect(wrapper.text()).toContain('Contoso-Base.de-DE.xlf');
    });

    it('offers the raw file, which is the only action left when nothing parses', async () => {
        const wrapper = mountApp();
        receive(error);
        await nextTick();
        clearPostedMessages();

        await wrapper.get('.status-pane button').trigger('click');

        expect(postedMessages).toEqual([{ type: 'openSource', target: 'text' }]);
    });
});

describe('theming', () => {
    it('hardcodes no colour anywhere in the webview', () => {
        // devTheme.css is exempt: it is the dev server's stand-in for a theme, and VS Code
        // never loads it.
        const sources = import.meta.glob('../../webview/**/*.{vue,css}', { query: '?raw', import: 'default', eager: true });
        const literal = /(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/;

        const offenders = Object.entries(sources)
            .filter(([path]) => !path.endsWith('devTheme.css'))
            .filter(([, source]) => literal.test(source))
            .map(([path]) => path);

        expect(offenders).toEqual([]);
        expect(Object.keys(sources).length).toBeGreaterThan(2);
    });
});

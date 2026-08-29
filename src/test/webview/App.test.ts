import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import App from '../../webview/App.vue';
import { ExtensionMessageType } from '../../shared/messages';
import { clearPostedMessages, postedMessages } from '../setup/webview';

import type { XliffDocumentDto } from '../../shared/dto';
import type { ExtensionMessage } from '../../shared/messages';

const DOCUMENT: XliffDocumentDto = {
    uri: 'file:///w/Fabrikam Base.de-DE.xlf',
    fileName: 'Fabrikam Base.de-DE.xlf',
    isBaseFile: false,
    readOnly: false,
    files: [{
        index: 0,
        sourceLanguage: 'en-US',
        targetLanguage: 'de-DE',
        original: 'Fabrikam Base',
        tree: [],
        units: [
            { id: '1', source: 'Customer', target: 'Kunde', state: 'translated', translate: true, notes: [] },
            { id: '2', source: 'Vendor', target: '', state: 'empty', translate: true, notes: [] },
        ],
        hasAlIds: true,
    }],
};

const send = (message: ExtensionMessage): void => {
    window.dispatchEvent(new MessageEvent('message', { data: message }));
};

function mountWithDocument(payload: XliffDocumentDto = DOCUMENT) {
    const wrapper = mount(App);
    send({ type: ExtensionMessageType.setDocument, payload });
    return wrapper;
}

describe('before a document arrives', () => {
    it('says so rather than rendering an empty shell', () => {
        expect(mount(App).text()).toContain('Waiting for a document');
    });

    it('posts exactly one ready on mount', () => {
        clearPostedMessages();
        mount(App);
        expect(postedMessages).toEqual([{ type: 'ready' }]);
    });

    it('injects the design tokens onto the document element', () => {
        mount(App);
        expect(document.documentElement.style.getPropertyValue('--gap')).toBe('12px');
        expect(document.documentElement.style.getPropertyValue('--row-height')).toBe('24px');
    });
});

describe('the file header', () => {
    it('names the file, both languages and the unit count', async () => {
        const wrapper = mountWithDocument();
        await nextTick();

        expect(wrapper.text()).toContain('Fabrikam Base.de-DE.xlf');
        expect(wrapper.text()).toContain('en-US');
        expect(wrapper.text()).toContain('de-DE');
        expect(wrapper.text()).toContain('2 translation units');
    });

    it('shows the original app name the file declares', async () => {
        const wrapper = mountWithDocument();
        await nextTick();
        expect(wrapper.get('.original').text()).toBe('Fabrikam Base');
    });

    it('marks a read-only document, so nobody wonders why editing is absent (§12.5)', async () => {
        const wrapper = mountWithDocument({ ...DOCUMENT, isBaseFile: true, readOnly: true });
        await nextTick();
        expect(wrapper.get('.tag').text()).toBe('read-only');
    });

    it('does not mark an editable one', async () => {
        const wrapper = mountWithDocument();
        await nextTick();
        expect(wrapper.find('.tag').exists()).toBe(false);
    });

    it('shows a dash for a file with no target language', async () => {
        const [file] = DOCUMENT.files;
        const wrapper = mountWithDocument({
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
        const wrapper = mount(App);

        send(error);
        await nextTick();

        expect(wrapper.get('.status-pane').classes()).toContain('pane');
        expect(wrapper.text()).toContain('Line 12, column 5');
        expect(wrapper.text()).not.toContain('Waiting for a document');
    });

    it('leaves the document readable behind a banner (§7.7)', async () => {
        const wrapper = mountWithDocument();
        send(error);
        await nextTick();

        expect(wrapper.get('.status-pane').classes()).toContain('banner');
        expect(wrapper.text()).toContain('Unclosed tag');
        expect(wrapper.text()).toContain('Fabrikam Base.de-DE.xlf');
    });

    it('offers the raw file, which is the only action left when nothing parses', async () => {
        const wrapper = mount(App);
        send(error);
        await nextTick();
        clearPostedMessages();

        await wrapper.get('.status-pane button').trigger('click');

        expect(postedMessages).toEqual([{ type: 'openSource', target: 'text' }]);
    });
});

describe('theming', () => {
    it('hardcodes no colour anywhere in the webview (§11.6)', () => {
        // global.css is exempt: its literals are the dev-server fallbacks that a real
        // webview overrides with the live theme.
        const sources = import.meta.glob('../../webview/**/*.{vue,css}', { query: '?raw', import: 'default', eager: true });
        const literal = /(?<![\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/;

        const offenders = Object.entries(sources)
            .filter(([path]) => !path.endsWith('global.css'))
            .filter(([, source]) => literal.test(source as string))
            .map(([path]) => path);

        expect(offenders).toEqual([]);
        expect(Object.keys(sources).length).toBeGreaterThan(2);
    });
});

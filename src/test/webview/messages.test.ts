import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import App from '../../webview/App.vue';
import { clearPostedMessages, postedMessages } from '../setup/webview';
import { ExtensionMessageType, WebviewMessageType } from '../../shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';

import type { ExtensionMessage } from '../../shared/messages';
import type { XliffDocumentDto } from '../../shared/dto';

function postFromHost(message: ExtensionMessage): void {
    window.dispatchEvent(new MessageEvent('message', { data: message }));
}

const DOCUMENT: XliffDocumentDto = {
    uri: 'file:///w/App.de-DE.xlf',
    fileName: 'App.de-DE.xlf',
    isBaseFile: false,
    readOnly: false,
    files: [{
        index: 0,
        sourceLanguage: 'en-US',
        targetLanguage: 'de-DE',
        tree: [],
        units: [{ id: '1', source: 'Customer', target: 'Kunde', state: 'translated', translate: true, notes: [] }],
        hasAlIds: false,
    }],
};

const sendDocument = (): void => postFromHost({ type: ExtensionMessageType.setDocument, payload: DOCUMENT });

describe('the extension → webview protocol', () => {
    it('shows placeholders and the declared defaults until the host speaks', () => {
        const wrapper = mount(App);

        expect(wrapper.text()).toContain('—');
        expect(wrapper.text()).toContain('off');
    });

    it('renders a loading message', async () => {
        const wrapper = mount(App);

        postFromHost({ type: ExtensionMessageType.loading, payload: { message: 'Parsing…' } });
        await nextTick();

        expect(wrapper.text()).toContain('Parsing…');
    });

    it('renders a document once it arrives', async () => {
        const wrapper = mount(App);

        sendDocument();
        await nextTick();

        expect(wrapper.text()).toContain('App.de-DE.xlf');
        expect(wrapper.text()).toContain('1 units in 1 file(s)');
    });

    it('clears the loading state when the document arrives', async () => {
        const wrapper = mount(App);

        postFromHost({ type: ExtensionMessageType.loading, payload: { message: 'Parsing…' } });
        await nextTick();
        sendDocument();
        await nextTick();

        expect(wrapper.text()).not.toContain('Parsing…');
        expect(wrapper.find('.status-pane').exists()).toBe(false);
    });

    it('applies settings the host sends', async () => {
        const wrapper = mount(App);

        postFromHost({
            type: ExtensionMessageType.settings,
            payload: { ...DEFAULT_WEBVIEW_SETTINGS, editMode: true, defaultExpandDepth: 3 },
        });
        await nextTick();

        expect(wrapper.text()).toContain('on');
        expect(wrapper.text()).toContain('3');
    });

    it('ignores messages that are not part of the contract', async () => {
        const wrapper = mount(App);

        window.dispatchEvent(new MessageEvent('message', { data: { type: 'not-ours', payload: {} } }));
        window.dispatchEvent(new MessageEvent('message', { data: 'garbage' }));
        window.dispatchEvent(new MessageEvent('message', { data: { type: ExtensionMessageType.loading } }));
        await nextTick();

        expect(wrapper.text()).toContain('—');
    });
});

describe('failure, with and without something behind it', () => {
    const error = { type: ExtensionMessageType.error, payload: { message: 'Unclosed tag', line: 12, col: 5 } } as const;

    it('blocks the view when nothing has ever parsed', async () => {
        const wrapper = mount(App);

        postFromHost(error);
        await nextTick();

        expect(wrapper.get('.status-pane').classes()).toContain('pane');
        expect(wrapper.text()).toContain('Unclosed tag');
        expect(wrapper.text()).toContain('Line 12, column 5');
        expect(wrapper.text()).not.toContain('Host');
    });

    it('keeps the last good document visible behind a banner (§7.7)', async () => {
        const wrapper = mount(App);

        // The host posts the last good document ahead of the error; both must land.
        sendDocument();
        postFromHost(error);
        await nextTick();

        expect(wrapper.get('.status-pane').classes()).toContain('banner');
        expect(wrapper.text()).toContain('Unclosed tag');
        expect(wrapper.text()).toContain('App.de-DE.xlf');
    });

    it('clears the error when a later parse succeeds', async () => {
        const wrapper = mount(App);

        sendDocument();
        postFromHost(error);
        await nextTick();
        sendDocument();
        await nextTick();

        expect(wrapper.find('.status-pane').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('Unclosed tag');
    });

    it('clears the error when a fresh attempt starts', async () => {
        const wrapper = mount(App);

        postFromHost(error);
        postFromHost({ type: ExtensionMessageType.loading, payload: { message: 'Parsing…' } });
        await nextTick();

        expect(wrapper.get('.status-pane').attributes('role')).toBeUndefined();
        expect(wrapper.get('.status-pane').attributes('aria-live')).toBe('polite');
        expect(wrapper.text()).toContain('Parsing…');
        expect(wrapper.text()).not.toContain('Unclosed tag');
    });

    it('asks the host to open the raw file when the pane offers it', async () => {
        const wrapper = mount(App);
        postFromHost(error);
        await nextTick();
        clearPostedMessages();

        await wrapper.get('.status-pane button').trigger('click');

        expect(postedMessages).toEqual([{ type: WebviewMessageType.openSource, target: 'text' }]);
    });
});

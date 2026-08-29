import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import App from '../../webview/App.vue';
import { ExtensionMessageType } from '../../shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';

import type { ExtensionMessage } from '../../shared/messages';

function postFromHost(message: ExtensionMessage): void {
    window.dispatchEvent(new MessageEvent('message', { data: message }));
}

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

    it('renders an error message', async () => {
        const wrapper = mount(App);

        postFromHost({ type: ExtensionMessageType.error, payload: { message: 'Unclosed tag', line: 12, col: 5 } });
        await nextTick();

        expect(wrapper.text()).toContain('Unclosed tag');
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

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import App from '../../webview/App.vue';
import { ExtensionMessageType } from '../../shared/messages';

function postFromHost(payload: { fileName: string; characters: number }): void {
    window.dispatchEvent(new MessageEvent('message', {
        data: { type: ExtensionMessageType.documentInfo, payload },
    }));
}

describe('document info message', () => {
    it('shows placeholders until the host reports the document', () => {
        const wrapper = mount(App);
        expect(wrapper.text()).toContain('—');
    });

    it('renders the file name and character count the host sends', async () => {
        const wrapper = mount(App);

        postFromHost({ fileName: 'test.xlf', characters: 272 });
        await nextTick();

        expect(wrapper.text()).toContain('test.xlf');
        expect(wrapper.text()).toContain('272');
    });

    it('ignores messages that are not part of the contract', async () => {
        const wrapper = mount(App);

        window.dispatchEvent(new MessageEvent('message', { data: { type: 'not-ours', payload: {} } }));
        window.dispatchEvent(new MessageEvent('message', { data: 'garbage' }));
        await nextTick();

        expect(wrapper.text()).toContain('—');
    });
});

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import App from '../../webview/App.vue';

describe('App', () => {
    it('mounts and renders its heading', () => {
        const wrapper = mount(App);
        expect(wrapper.text()).toContain('XLIFF Viewer');
    });

    it('reports the VS Code host when acquireVsCodeApi is present', () => {
        // The setup file installs the stub, so vscode.ts caches a real handle.
        const wrapper = mount(App);
        expect(wrapper.text()).toContain('VS Code webview');
    });

    it('injects the design tokens onto the document element', () => {
        mount(App);
        expect(document.documentElement.style.getPropertyValue('--gap')).toBe('12px');
        expect(document.documentElement.style.getPropertyValue('--row-height')).toBe('24px');
    });
});

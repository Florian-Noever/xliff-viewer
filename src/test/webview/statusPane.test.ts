import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import StatusPane from '../../webview/components/StatusPane.vue';
import SOURCE from '../../webview/components/StatusPane.vue?raw';

describe('the loading state', () => {
    it('announces politely rather than interrupting', () => {
        const pane = mount(StatusPane, { props: { loading: 'Reading the translation file…' } });

        expect(pane.text()).toContain('Reading the translation file…');
        expect(pane.attributes('aria-live')).toBe('polite');
        expect(pane.attributes('role')).toBeUndefined();
        expect(pane.find('.spinner').exists()).toBe(true);
    });

    it('offers no action — there is nothing to do but wait', () => {
        const pane = mount(StatusPane, { props: { loading: 'Parsing…' } });
        expect(pane.find('button').exists()).toBe(false);
    });
});

describe('the error state', () => {
    const error = { message: 'Closing tag is not matching', line: 412, col: 7 };

    it('interrupts, because a failure the user does not notice is worse', () => {
        const pane = mount(StatusPane, { props: { error } });

        expect(pane.attributes('role')).toBe('alert');
        expect(pane.text()).toContain('Closing tag is not matching');
    });

    it('shows the position the validator reported', () => {
        expect(mount(StatusPane, { props: { error } }).text()).toContain('Line 412, column 7');
    });

    it('shows a line without a column, which the validator sometimes reports', () => {
        const pane = mount(StatusPane, { props: { error: { message: 'broken', line: 9 } } });

        expect(pane.text()).toContain('Line 9');
        expect(pane.text()).not.toContain('column');
    });

    it('says nothing about position when there is none — a structural error has no line', () => {
        const pane = mount(StatusPane, { props: { error: { message: 'The document contains no <file> element.' } } });
        expect(pane.text()).not.toContain('Line');
    });

    it('offers "Open as text" and emits when it is pressed', async () => {
        const pane = mount(StatusPane, { props: { error } });

        await pane.get('button').trigger('click');

        expect(pane.emitted('openAsText')).toHaveLength(1);
    });

    it('wins over a loading message that was never cleared', () => {
        const pane = mount(StatusPane, { props: { loading: 'Parsing…', error } });

        expect(pane.attributes('role')).toBe('alert');
        expect(pane.text()).not.toContain('Parsing…');
        expect(pane.find('.spinner').exists()).toBe(false);
    });
});

describe('variants', () => {
    it('renders nothing at all when idle', () => {
        expect(mount(StatusPane, { props: {} }).find('.status-pane').exists()).toBe(false);
    });

    it('carries the variant as a class, so a banner does not look like a blocking pane', () => {
        expect(mount(StatusPane, { props: { loading: 'x', variant: 'pane' } }).classes()).toContain('pane');
        expect(mount(StatusPane, { props: { loading: 'x', variant: 'banner' } }).classes()).toContain('banner');
    });
});

describe('theming', () => {
    it('takes every colour from a VS Code variable, so both themes work (§11.6)', () => {
        // jsdom cannot render a theme; what it can prove is that no colour is hardcoded,
        // which is the actual requirement.
        const styles = SOURCE.split('<style')[1] ?? '';
        const literals = styles.match(/(?<![\w-])(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/g) ?? [];

        expect(literals).toEqual([]);
        expect(styles).toContain('--vscode-inputValidation-errorBorder');
        expect(styles).toContain('--vscode-errorForeground');
    });

    it('spins only when the viewer has not asked for reduced motion (§11.7)', () => {
        const styles = SOURCE;
        expect(styles).toContain('prefers-reduced-motion: no-preference');
    });
});

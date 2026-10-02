import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import StateBadge from '../../webview/components/StateBadge.vue';
import { XliffState } from '../../shared/state';

describe('StateBadge', () => {
    it('names the state as well as colouring it', () => {
        const badge = mount(StateBadge, { props: { state: XliffState.needsTranslation } });

        expect(badge.text()).toBe('needs translation');
        expect(badge.classes()).toContain('tone-pending');
    });

    it('colours each group differently', () => {
        const toneOf = (state: XliffState) => mount(StateBadge, { props: { state } }).classes()
            .find(name => name.startsWith('tone-'));

        expect(toneOf(XliffState.translated)).toBe('tone-done');
        expect(toneOf(XliffState.needsAdaptation)).toBe('tone-pending');
        expect(toneOf(XliffState.missing)).toBe('tone-absent');
    });

    it('is a dot and a word, and nothing else to draw', () => {
        // No background, so the badge reads like the toolbar's state chips. jsdom cannot
        // see a colour, but it can see that nothing is left needing one.
        const badge = mount(StateBadge, { props: { state: XliffState.translated } });

        expect(badge.get('.dot').attributes('aria-hidden')).toBe('true');
        expect(badge.get('.label').text()).toBe('translated');
        expect(badge.element.children).toHaveLength(2);
    });

    it('mutes an untranslatable unit and says why', () => {
        const badge = mount(StateBadge, { props: { state: XliffState.missing, muted: true } });

        expect(badge.classes()).toContain('tone-muted');
        expect(badge.text()).toBe('not translatable');
        expect(badge.attributes('title')).toContain('translate="no"');
    });
});

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MetaChips from '../../webview/components/MetaChips.vue';
import { XliffState } from '../../shared/state';
import { exampleUnitDto } from '../support/dtoBuilders';

describe('MetaChips (nothing dropped)', () => {
    it('shows nothing for an ordinary unit', () => {
        expect(mount(MetaChips, { props: { unit: exampleUnitDto() } }).find('.chip').exists()).toBe(false);
    });

    it('shows maxwidth with the unit it is counted in', () => {
        const chips = mount(MetaChips, { props: { unit: exampleUnitDto({ maxwidth: 50, sizeUnit: 'char' }) } });

        expect(chips.get('.chip').text()).toBe('max 50 char');
    });

    it('shows al-object-target', () => {
        const chips = mount(MetaChips, { props: { unit: exampleUnitDto({ alObjectTarget: 'Page 10' }) } });

        expect(chips.text()).toContain('Page 10');
    });

    it('explains an untranslatable unit rather than only muting it', () => {
        const chips = mount(MetaChips, { props: { unit: exampleUnitDto({ translate: false }) } });

        expect(chips.get('.chip').text()).toBe('translate="no"');
        expect(chips.get('.chip').attributes('title')).toContain('excluded from every roll-up');
    });

    it('surfaces a state the spec does not define, which the badge can only call unknown', () => {
        const chips = mount(MetaChips, { props: { unit: exampleUnitDto({ state: XliffState.unknown, rawState: 'proofread' }) } });

        expect(chips.text()).toContain('state="proofread"');
    });

    it('shows every optional attribute at once', () => {
        const chips = mount(MetaChips, {
            props: { unit: exampleUnitDto({ translate: false, maxwidth: 50, sizeUnit: 'char', alObjectTarget: 'Page 1', rawState: 'x' }) },
        });

        expect(chips.findAll('.chip')).toHaveLength(4);
    });
});

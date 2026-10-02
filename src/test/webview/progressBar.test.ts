import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ProgressBar from '../../webview/components/ProgressBar.vue';
import { summariseUnits, XliffState } from '../../shared/state';
import { unitDto } from '../support/dtoBuilders';

import type { TransUnitDto } from '../../shared/dto';
import type { StateSummary } from '../../shared/state';

describe('ProgressBar', () => {
    const summary = (units: TransUnitDto[]): StateSummary => summariseUnits(units);

    it('reports how many of the translatable are done', () => {
        const bar = mount(ProgressBar, {
            props: {
                summary: summary([
                    unitDto('a', { state: XliffState.translated }),
                    unitDto('b', { state: XliffState.translated }),
                    unitDto('c', { state: XliffState.empty }),
                ]),
            },
        });

        expect(bar.get('.counts').text()).toBe('2/3');
        expect(bar.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('67');
        expect(bar.get('[role="progressbar"]').attributes('aria-label')).toBe('2 of 3 translated');
    });

    it('puts the counts before the bar, so a column of bars lines up', () => {
        // With the bar first, `120/122` and `8/8` would push their bars to different places.
        const bar = mount(ProgressBar, { props: { summary: summary([unitDto('a', { state: XliffState.translated })]) } });

        expect([...bar.element.children].map(child => child.className)).toEqual(['counts', 'track']);
    });

    it('takes its colour from the worst descendant, not from the percentage', () => {
        // 2 of 3 either way; what differs is how bad the outstanding one is.
        const pending = mount(ProgressBar, {
            props: { summary: summary([unitDto('a', { state: XliffState.translated }), unitDto('b', { state: XliffState.translated }), unitDto('c', { state: XliffState.needsTranslation })]) },
        });
        const absent = mount(ProgressBar, {
            props: { summary: summary([unitDto('a', { state: XliffState.translated }), unitDto('b', { state: XliffState.translated }), unitDto('c', { state: XliffState.missing })]) },
        });

        expect(pending.get('.fill').classes()).toContain('tone-pending');
        expect(absent.get('.fill').classes()).toContain('tone-absent');
    });

    it('renders nothing when nothing underneath is translatable', () => {
        const bar = mount(ProgressBar, {
            props: { summary: summary([unitDto('a', { state: XliffState.missing, translate: false })]) },
        });

        expect(bar.find('.progress').exists()).toBe(false);
    });

    it('says what it is counting, including the units it excluded', () => {
        const bar = mount(ProgressBar, {
            props: { summary: summary([unitDto('a', { state: XliffState.translated }), unitDto('b', { state: XliffState.missing, translate: false })]) },
        });

        expect(bar.get('.progress').attributes('title')).toBe('2 units, 1 translatable — worst: translated');
    });
});

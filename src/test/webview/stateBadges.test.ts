import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { computed, defineComponent, ref } from 'vue';

import ProgressBar from '../../webview/components/ProgressBar.vue';
import StateBadge from '../../webview/components/StateBadge.vue';
import { useRollup } from '../../webview/composables/useRollup';
import { stateLabel, StateTone, stateTone } from '../../webview/stateTone';
import { SPEC_STATES, summariseUnits, XliffState } from '../../shared/state';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '../../shared/dto';
import type { StateSummary } from '../../shared/state';
import type { Rollup } from '../../webview/composables/useRollup';

const unit = (id: string, state: XliffState, translate = true): TransUnitDto =>
    ({ id, source: id, state, translate, notes: [] });

describe('stateTone', () => {
    it('calls the three complete states done', () => {
        for (const state of [XliffState.translated, XliffState.signedOff, XliffState.final]) {
            expect(stateTone(state), state).toBe(StateTone.done);
        }
    });

    it('calls everything the spec expects work on pending', () => {
        for (const state of SPEC_STATES.filter(each => stateTone(each) !== StateTone.done)) {
            expect(stateTone(state), state).toBe(StateTone.pending);
        }
    });

    it('calls the three synthetic states absent', () => {
        for (const state of [XliffState.missing, XliffState.empty, XliffState.unknown]) {
            expect(stateTone(state), state).toBe(StateTone.absent);
        }
    });

    it('treats something outside the union as absent, not as fine', () => {
        expect(stateTone('proofread' as XliffState)).toBe(StateTone.absent);
    });

    it('gives every state a tone', () => {
        for (const state of Object.values(XliffState)) {
            expect(Object.values(StateTone)).toContain(stateTone(state));
        }
    });

    it('writes a state as words, not as a config key', () => {
        expect(stateLabel(XliffState.needsReviewTranslation)).toBe('needs review translation');
    });
});

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

describe('ProgressBar', () => {
    const summary = (units: TransUnitDto[]): StateSummary => summariseUnits(units);

    it('reports how many of the translatable are done', () => {
        const bar = mount(ProgressBar, {
            props: {
                summary: summary([
                    unit('a', XliffState.translated),
                    unit('b', XliffState.translated),
                    unit('c', XliffState.empty),
                ]),
            },
        });

        expect(bar.get('.counts').text()).toBe('2/3');
        expect(bar.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('67');
        expect(bar.get('[role="progressbar"]').attributes('aria-label')).toBe('2 of 3 translated');
    });

    it('puts the counts before the bar, so a column of bars lines up', () => {
        // With the bar first, `120/122` and `8/8` would push their bars to different places.
        const bar = mount(ProgressBar, { props: { summary: summary([unit('a', XliffState.translated)]) } });

        expect([...bar.element.children].map(child => child.className)).toEqual(['counts', 'track']);
    });

    it('takes its colour from the worst descendant, not from the percentage', () => {
        // 2 of 3 either way; what differs is how bad the outstanding one is.
        const pending = mount(ProgressBar, {
            props: { summary: summary([unit('a', XliffState.translated), unit('b', XliffState.translated), unit('c', XliffState.needsTranslation)]) },
        });
        const absent = mount(ProgressBar, {
            props: { summary: summary([unit('a', XliffState.translated), unit('b', XliffState.translated), unit('c', XliffState.missing)]) },
        });

        expect(pending.get('.fill').classes()).toContain('tone-pending');
        expect(absent.get('.fill').classes()).toContain('tone-absent');
    });

    it('renders nothing when nothing underneath is translatable', () => {
        const bar = mount(ProgressBar, {
            props: { summary: summary([unit('a', XliffState.missing, false)]) },
        });

        expect(bar.find('.progress').exists()).toBe(false);
    });

    it('says what it is counting, including the units it excluded', () => {
        const bar = mount(ProgressBar, {
            props: { summary: summary([unit('a', XliffState.translated), unit('b', XliffState.missing, false)]) },
        });

        expect(bar.get('.progress').attributes('title')).toBe('2 units, 1 translatable — worst: translated');
    });
});

describe('useRollup', () => {
    const tree: AlNodeDto[] = [
        {
            key: 'Table 1',
            type: 'Table',
            name: 'Customer',
            children: [
                { key: 'Table 1 - Property 2', type: 'Property', children: [] },
                { key: 'Table 1 - Property 3', type: 'Property', children: [] },
            ],
        },
        { key: 'Table 4', type: 'Table', name: 'Vendor', children: [{ key: 'Table 4 - Property 5', type: 'Property', children: [] }] },
    ];

    const units = [
        unit('Table 1 - Property 2', XliffState.translated),
        unit('Table 1 - Property 3', XliffState.empty),
        unit('Table 4 - Property 5', XliffState.translated),
    ];

    function rollupOf(file: XliffFileDto | undefined): Rollup {
        let captured: Rollup | undefined;
        const active = ref(file);
        mount(defineComponent({
            setup() {
                captured = useRollup({
                    file: computed(() => active.value),
                    unitsById: computed(() => new Map((active.value?.units ?? []).map(each => [each.id, each]))),
                });
                return () => null;
            },
        }));
        if (captured === undefined) {
            throw new Error('composable did not run');
        }
        return captured;
    }

    const file: XliffFileDto = { index: 0, sourceLanguage: 'en-US', targetLanguage: 'de-DE', tree, units, hasAlIds: true };

    it('summarises every node by key', () => {
        const rollup = rollupOf(file);

        expect([...rollup.byKey.value.keys()].sort()).toEqual([
            'Table 1',
            'Table 1 - Property 2',
            'Table 1 - Property 3',
            'Table 4',
            'Table 4 - Property 5',
        ]);
    });

    it('rolls the worst descendant up to its container', () => {
        const rollup = rollupOf(file);

        expect(rollup.byKey.value.get('Table 1')?.worst).toBe(XliffState.empty);
        expect(rollup.byKey.value.get('Table 1')?.percent).toBe(50);
        expect(rollup.byKey.value.get('Table 4')?.worst).toBe(XliffState.translated);
        expect(rollup.byKey.value.get('Table 4')?.percent).toBe(100);
    });

    it('summarises the whole file for the header', () => {
        const rollup = rollupOf(file);

        expect(rollup.file.value.total).toBe(3);
        expect(rollup.file.value.translatedCount).toBe(2);
        expect(rollup.file.value.percent).toBe(67);
    });

    it('feeds the DTO straight in — TransUnitDto is already a UnitState', () => {
        // If this ever needs a conversion step, the DTO has drifted from the roll-up.
        expect(summariseUnits(units)).toEqual(rollupOf(file).file.value);
    });

    it('is empty, not undefined, before a file arrives', () => {
        const rollup = rollupOf(undefined);

        expect(rollup.byKey.value.size).toBe(0);
        expect(rollup.file.value.total).toBe(0);
        expect(rollup.file.value.worst).toBeUndefined();
    });
});

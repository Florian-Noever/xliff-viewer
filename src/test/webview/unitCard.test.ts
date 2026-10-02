import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import UnitCard from '../../webview/components/UnitCard.vue';
import { stateLabel } from '../../webview/stateTone';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { XliffState } from '../../shared/state';
import { exampleUnitDto } from '../support/dtoBuilders';

import type { TransUnitDto } from '../../shared/dto';
import type { WebviewSettings } from '../../shared/settings';

const unit = (over: Partial<TransUnitDto> = {}): TransUnitDto => exampleUnitDto({ source: 'Customer', target: 'Kunde', ...over });

const card = (over: Partial<TransUnitDto> = {}, settings: Partial<WebviewSettings> = {}) =>
    mount(UnitCard, { props: { unit: unit(over), settings: { ...DEFAULT_WEBVIEW_SETTINGS, ...settings } } });

describe('source and target', () => {
    it('shows both', () => {
        const wrapper = card();

        expect(wrapper.get('.source').text()).toBe('Customer');
        expect(wrapper.get('.target').text()).toBe('Kunde');
    });

    it('says a target is absent rather than showing a blank line', () => {
        expect(card({ target: undefined, state: XliffState.missing }).get('.target').text()).toBe('no target');
    });

    it('tells an empty target apart from an absent one', () => {
        expect(card({ target: '', state: XliffState.empty }).get('.target').text()).toBe('empty target');
    });

    it('survives an empty source without losing the row', () => {
        const wrapper = card({ source: '' });

        expect(wrapper.get('.source').text()).toBe('(empty source)');
        expect(wrapper.get('.target').text()).toBe('Kunde');
    });

    it('renders text as text, not as a disabled input', () => {
        const wrapper = card();

        expect(wrapper.find('input').exists()).toBe(false);
        expect(wrapper.find('textarea').exists()).toBe(false);
    });
});

describe('load-bearing whitespace', () => {
    it('marks a target that is nothing but a space', () => {
        const wrapper = card({ source: 'Name', target: ' ', state: XliffState.translated });

        expect(wrapper.findAll('.ws')).not.toHaveLength(0);
        expect(wrapper.get('.target').text()).toContain('␣');
        expect(wrapper.get('.whitespace-note').text()).toContain('only whitespace');
    });

    it('tells that apart from an empty target', () => {
        expect(card({ target: '', state: XliffState.empty }).find('.ws').exists()).toBe(false);
    });

    it('marks edge whitespace the source does not have', () => {
        const wrapper = card({ source: 'Name', target: ' Name ' });

        expect(wrapper.get('.target').text()).toBe('␣Name␣');
        expect(wrapper.get('.whitespace-note').text()).toContain('differ from the source');
    });

    it('says nothing when the edges match the source', () => {
        const wrapper = card({ source: ' Name ', target: ' Name ' });

        expect(wrapper.find('.ws').exists()).toBe(false);
        expect(wrapper.find('.whitespace-note').exists()).toBe(false);
    });

    it('explains the rule wherever it marks, since it is not obvious why others are not marked', () => {
        expect(card({ source: 'Name', target: 'Name ' }).get('.whitespace-note').text()).toMatch(/change the meaning/);
    });
});

describe('the Developer hint', () => {
    it('shows the suggestion the note makes for the file\'s language', () => {
        const wrapper = card({
            target: 'Kundin',
            notes: [{ from: 'Developer', value: 'de-DE=Kunde' }],
            developerHint: 'Kunde',
        });

        expect(wrapper.get('.aside').text()).toContain('Kunde');
        expect(wrapper.text()).toContain('de-DE=Kunde');
    });

    it('labels the row the way every other label in the card is written', () => {
        const wrapper = card({ target: 'Kundin', notes: [{ from: 'Developer', value: 'de-DE=Kunde' }], developerHint: 'Kunde' });

        expect(wrapper.get('.aside .label').text()).toBe('Suggested');
    });

    it('stays quiet when the translator already used it', () => {
        // Otherwise every unit prints its target twice, once as the suggestion.
        const wrapper = card({ target: 'Kunde', notes: [{ from: 'Developer', value: 'de-DE=Kunde' }], developerHint: 'Kunde' });

        expect(wrapper.find('.aside').exists()).toBe(false);
        expect(wrapper.text()).toContain('de-DE=Kunde');
    });

    it('follows showDeveloperNotes', () => {
        const wrapper = card(
            { target: 'Kundin', notes: [{ from: 'Developer', value: 'de-DE=Kunde' }], developerHint: 'Kunde' },
            { showDeveloperNotes: false },
        );

        expect(wrapper.find('.aside').exists()).toBe(false);
    });
});

describe('the generator note', () => {
    it('shows the note it is given, whatever the setting, since the tree applies it', () => {
        const wrapper = mount(UnitCard, {
            props: {
                unit: unit(),
                settings: DEFAULT_WEBVIEW_SETTINGS,
                generatorNote: 'Table Customer - Property Caption',
            },
        });

        expect(wrapper.text()).toContain('Xliff Generator');
        expect(wrapper.text()).toContain('Table Customer - Property Caption');
    });

    it('is absent when the caller did not reconstruct one', () => {
        expect(card().text()).not.toContain('Xliff Generator');
    });
});

describe('every DTO field is reachable', () => {
    it('renders something for each one', () => {
        // Nothing the file carries may be dropped. If a field is added to TransUnitDto and
        // nothing here shows it, this fails.
        // Each field carries a string no other field contains, so none passes for another.
        const full = unit({
            source: 'Alpha source',
            baseSource: 'Bravo base',
            target: ' Charlie target ',
            state: XliffState.unknown,
            rawState: 'proofread',
            declaredState: XliffState.signedOff,
            translate: false,
            maxwidth: 50,
            sizeUnit: 'pixel',
            alObjectTarget: 'Page 10',
            notes: [{ from: 'Developer', value: 'Delta note' }],
            developerHint: 'Echo hint',
        });
        const wrapper = mount(UnitCard, {
            props: { unit: full, settings: DEFAULT_WEBVIEW_SETTINGS, generatorNote: 'Table Foxtrot - Property Caption' },
        });
        const text = wrapper.text();

        const shown: Record<keyof TransUnitDto, boolean> = {
            id: true, // the row's key, and the path the generator note spells out
            source: text.includes('Alpha source'),
            target: text.includes('Charlie target'),
            // Muted, since the unit is not translatable: the state moves to the badge's title.
            state: wrapper.get('.legend .state-badge').attributes('title') === `translate="no" — ${stateLabel(XliffState.unknown)}`,
            rawState: text.includes('proofread'),
            declaredState: text.includes('state="signed-off"'),
            translate: text.includes('translate="no"'),
            maxwidth: text.includes('max 50'),
            sizeUnit: text.includes('pixel'),
            alObjectTarget: text.includes('Page 10'),
            notes: text.includes('Delta note'),
            developerHint: wrapper.get('.aside').text().includes('Echo hint'),
            orphaned: true, // covered by its own case below; mutually exclusive with baseSource
            baseSource: text.includes('Bravo base'),
        };

        expect(Object.entries(shown).filter(([, visible]) => !visible).map(([field]) => field)).toEqual([]);
    });
});

describe('the labelled box', () => {
    const boxed = (over: Partial<TransUnitDto> = {}, props: Record<string, unknown> = {}) =>
        mount(UnitCard, { props: { unit: unit(over), settings: DEFAULT_WEBVIEW_SETTINGS, ...props } });

    it('legends the box with the name and the state, together', () => {
        const wrapper = boxed({}, { name: 'Caption' });

        expect(wrapper.get('.legend-name').text()).toBe('Caption');
        expect(wrapper.get('.legend .state-badge').text()).toBe('translated');
    });

    it('labels the box for a screen reader with the legend it shows', () => {
        const wrapper = boxed({}, { name: 'Caption' });
        const box = wrapper.get('.box');

        expect(box.attributes('aria-labelledby')).toBe(wrapper.get('.legend').attributes('id'));
    });

    it('falls back to the id when the caller has no name to give', () => {
        // A node whose generator note could not be parsed has no name. The last id
        // segment is what a search of the raw file would match, so it beats a blank legend.
        expect(boxed().get('.legend-name').text()).toBe('Property 2');
    });

    it('labels the source Original and the target with its language', () => {
        const wrapper = boxed({}, { targetLanguage: 'de-DE' });
        const labels = wrapper.findAll('.strings .label').map(each => each.text());

        expect(labels).toEqual(['Original', '[ de-DE ]']);
        expect(wrapper.findAll('.strings .value').map(each => each.text())).toEqual(['Customer', 'Kunde']);
    });

    it('says "target" rather than empty brackets when the file declares no language', () => {
        expect(boxed().findAll('.strings .label').map(each => each.text())).toEqual(['Original', 'target']);
    });

    it('keeps the absent and empty target wordings inside the cell', () => {
        expect(boxed({ target: undefined, state: XliffState.missing }).get('.target').text()).toBe('no target');
        expect(boxed({ target: '', state: XliffState.empty }).get('.target').text()).toBe('empty target');
        expect(boxed({ source: '' }).get('.source').text()).toBe('(empty source)');
    });

    it('keeps the load-bearing whitespace marks inside the cell', () => {
        const wrapper = boxed({ source: 'Name', target: ' ' });

        expect(wrapper.get('.target').text()).toContain('␣');
        expect(wrapper.get('.whitespace-note').text()).toContain('only whitespace');
    });

    it('renders one translation row, because XLIFF 1.2 allows one target', () => {
        // `<target>` is singular in the format, `<alt-trans>` is not modelled, and a second
        // language is a second file. The list is the seam for showing those files side by side.
        expect(boxed({}, { targetLanguage: 'de-DE' }).findAll('.strings .target')).toHaveLength(1);
    });
});

describe('the base ⊕ language pairing', () => {
    it('says a unit the base no longer has is orphaned', () => {
        const wrapper = card({ orphaned: true });

        expect(wrapper.get('.pairing.orphaned').text()).toContain('no longer has this unit');
    });

    it('shows the base source when it has changed, so the reader can see what it now says', () => {
        const wrapper = card({ source: 'Client', baseSource: 'Customer' });

        expect(wrapper.get('.pairing.changed').text()).toContain('source has changed');
        expect(wrapper.get('.base-source').text()).toBe('Customer');
    });

    it('renders an empty base source as such rather than as a blank line', () => {
        expect(card({ baseSource: '' }).get('.base-source').text()).toBe('(empty)');
    });

    it('marks neither when the unit is in step with its base', () => {
        const wrapper = card();

        expect(wrapper.find('.pairing').exists()).toBe(false);
    });
});

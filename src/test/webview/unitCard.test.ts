import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MetaChips from '../../webview/components/MetaChips.vue';
import NoteList from '../../webview/components/NoteList.vue';
import UnitCard from '../../webview/components/UnitCard.vue';
import { indexNodes, reconstructGeneratorNote } from '../../webview/generatorNote';
import { loadBearingWhitespace, WhitespaceReason } from '../../webview/whitespace';
import { translationLabel, translations } from '../../webview/translations';
import { stateLabel } from '../../webview/stateTone';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { XliffState } from '../../shared/state';
import { exampleUnitDto } from '../support/dtoBuilders';

import type { AlNodeDto, TransUnitDto } from '../../shared/dto';
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

describe('loadBearingWhitespace', () => {
    it('ignores an absent or empty target', () => {
        expect(loadBearingWhitespace('a', undefined)).toBeUndefined();
        expect(loadBearingWhitespace('a', '')).toBeUndefined();
    });

    it('calls a whitespace-only target out however it is spelt', () => {
        expect(loadBearingWhitespace('a', ' ')).toBe(WhitespaceReason.only);
        expect(loadBearingWhitespace('a', '\t\n')).toBe(WhitespaceReason.only);
    });

    it('compares both edges against the source, not against nothing', () => {
        expect(loadBearingWhitespace('a', ' a')).toBe(WhitespaceReason.edges);
        expect(loadBearingWhitespace('a', 'a ')).toBe(WhitespaceReason.edges);
        expect(loadBearingWhitespace(' a ', ' a ')).toBeUndefined();
        expect(loadBearingWhitespace(' a', 'a')).toBe(WhitespaceReason.edges);
    });

    it('does not care about whitespace in the middle', () => {
        expect(loadBearingWhitespace('a b', 'a  b')).toBeUndefined();
    });
});

describe('MetaChips (nothing dropped)', () => {
    it('shows nothing for an ordinary unit', () => {
        expect(mount(MetaChips, { props: { unit: unit() } }).find('.chip').exists()).toBe(false);
    });

    it('shows maxwidth with the unit it is counted in', () => {
        const chips = mount(MetaChips, { props: { unit: unit({ maxwidth: 50, sizeUnit: 'char' }) } });

        expect(chips.get('.chip').text()).toBe('max 50 char');
    });

    it('shows al-object-target', () => {
        const chips = mount(MetaChips, { props: { unit: unit({ alObjectTarget: 'Page 10' }) } });

        expect(chips.text()).toContain('Page 10');
    });

    it('explains an untranslatable unit rather than only muting it', () => {
        const chips = mount(MetaChips, { props: { unit: unit({ translate: false }) } });

        expect(chips.get('.chip').text()).toBe('translate="no"');
        expect(chips.get('.chip').attributes('title')).toContain('excluded from every roll-up');
    });

    it('surfaces a state the spec does not define, which the badge can only call unknown', () => {
        const chips = mount(MetaChips, { props: { unit: unit({ state: XliffState.unknown, rawState: 'proofread' }) } });

        expect(chips.text()).toContain('state="proofread"');
    });

    it('shows every optional attribute at once', () => {
        const chips = mount(MetaChips, {
            props: { unit: unit({ translate: false, maxwidth: 50, sizeUnit: 'char', alObjectTarget: 'Page 1', rawState: 'x' }) },
        });

        expect(chips.findAll('.chip')).toHaveLength(4);
    });
});

describe('NoteList', () => {
    const notes = [
        { from: 'Developer', value: 'de-DE=Kunde' },
        { from: 'Reviewer', value: 'checked' },
        { value: 'anonymous' },
    ];

    it('shows every note verbatim, including ones from tools we do not know', () => {
        const list = mount(NoteList, { props: { notes, showDeveloperNotes: true } });

        expect(list.findAll('.from')).toHaveLength(3);
        expect(list.text()).toContain('checked');
        expect(list.text()).toContain('anonymous');
    });

    it('labels a note with no from at all', () => {
        const list = mount(NoteList, { props: { notes: [{ value: 'x' }], showDeveloperNotes: true } });

        expect(list.get('.from').text()).toBe('note');
    });

    it('shows an empty Developer note as empty rather than hiding it', () => {
        // Absent and empty are different facts.
        const list = mount(NoteList, { props: { notes: [{ from: 'Developer', value: '' }], showDeveloperNotes: true } });

        expect(list.get('.empty').text()).toBe('(empty)');
    });

    it('hides only the Developer notes when the setting is off', () => {
        const list = mount(NoteList, { props: { notes, showDeveloperNotes: false } });

        expect(list.findAll('.from')).toHaveLength(2);
        expect(list.text()).not.toContain('de-DE=Kunde');
    });

    it('renders nothing at all when there is nothing to show', () => {
        expect(mount(NoteList, { props: { notes: [], showDeveloperNotes: true } }).find('.note-list').exists()).toBe(false);
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

describe('the reconstructed generator note', () => {
    const tree: AlNodeDto[] = [{
        key: 'Table 1',
        type: 'Table',
        name: 'PTE Contoso Methods Setup',
        children: [{
            key: 'Table 1 - Field 2',
            type: 'Field',
            name: 'Contoso Method',
            children: [{ key: 'Table 1 - Field 2 - Property 3', type: 'Property', name: 'Caption', children: [] }],
        }],
    }];

    it('rebuilds the note the payload does not carry', () => {
        const note = reconstructGeneratorNote('Table 1 - Field 2 - Property 3', indexNodes(tree));

        expect(note).toBe('Table PTE Contoso Methods Setup - Field Contoso Method - Property Caption');
    });

    it('gives up rather than guessing when a name could not be parsed', () => {
        const unnamed: AlNodeDto[] = [{ key: 'Table 1', type: 'Table', children: [] }];

        expect(reconstructGeneratorNote('Table 1', indexNodes(unnamed))).toBeUndefined();
    });

    it('gives up on an id that is not in the tree', () => {
        expect(reconstructGeneratorNote('Table 9', indexNodes(tree))).toBeUndefined();
    });

    it('starts with the namespace and skips the levels the tree adds', () => {
        const id = 'Namespace Contoso.Sales - Report "Contoso Sales - Quote" - Property Caption';
        const namespaced: AlNodeDto[] = [{
            key: 'Namespace 1',
            type: 'Namespace',
            name: 'Contoso.Sales',
            children: [{
                key: 'type:Namespace 1/Report',
                type: 'Report',
                name: 'Reports (1)',
                group: true,
                children: [{
                    key: 'Namespace 1 - Report 2',
                    type: 'Report',
                    name: 'Contoso Sales - Quote',
                    children: [{ key: id, type: 'Property', name: 'Caption', children: [] }],
                }],
            }],
        }];

        expect(reconstructGeneratorNote(id, indexNodes(namespaced))).toBe('Namespace Contoso.Sales - Report Contoso Sales - Quote - Property Caption');
    });

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

describe('translations()', () => {
    it('returns exactly one entry, carrying the language, the value and the state', () => {
        expect(translations(unit(), 'de-DE')).toEqual([{ language: 'de-DE', value: 'Kunde', state: XliffState.translated }]);
    });

    it('keeps an absent target absent rather than turning it into an empty string', () => {
        expect(translations(unit({ target: undefined }), 'de-DE')[0].value).toBeUndefined();
    });

    it('carries no language when the file declares none', () => {
        expect(translations(unit())[0].language).toBeUndefined();
    });

    it('labels a row with the language in brackets, or the plain word without one', () => {
        expect(translationLabel({ language: 'fr-FR', state: XliffState.translated })).toBe('[ fr-FR ]');
        expect(translationLabel({ state: XliffState.translated })).toBe('target');
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

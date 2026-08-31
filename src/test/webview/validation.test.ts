import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';

import { projectDocument } from '../../extension/xliff/dto';
import { parseXliff } from '../../extension/xliff/parser';
import TreeRow from '../../webview/components/TreeRow.vue';
import UnitCard from '../../webview/components/UnitCard.vue';
import { useValidation } from '../../webview/composables/useValidation';
import { UNIT_ACTIONS_KEY } from '../../webview/unitActions';
import { HintKind, hintsFor } from '../../webview/validation';

import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { XliffState } from '../../shared/state';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '../../shared/dto';
import type { WebviewSettings } from '../../shared/settings';
import type { Hint } from '../../webview/validation';

/**
 * `POLISH-01`. MASTER_PLAN §12.4: hints in the GUI that never block an edit and never
 * change a value. Everything here is about what they say and when they stay quiet — a hint
 * that fires on a translation a translator meant is worse than no hint at all.
 */

const unit = (over: Partial<TransUnitDto> = {}): TransUnitDto => ({
    id: 'Table 1 - Property 2',
    source: 'ExampleSourceText',
    target: 'ExampleTranslation',
    state: XliffState.translated,
    translate: true,
    notes: [],
    ...over,
});

const TRANSLATING = { sourceLanguage: 'en-US', targetLanguage: 'de-DE', sameAsSource: false };

const kinds = (hints: readonly Hint[]): readonly string[] => hints.map(hint => hint.kind);
const only = (hints: readonly Hint[], kind: string): Hint => {
    const found = hints.find(hint => hint.kind === kind);
    if (found === undefined) {
        throw new Error(`no ${kind} hint in [${kinds(hints).join(', ')}]`);
    }
    return found;
};

describe('what a unit is never checked for', () => {
    it('says nothing about a unit with no target — a base file is nothing else', () => {
        expect(hintsFor(unit({ target: undefined, state: XliffState.missing, maxwidth: 1, sizeUnit: 'char' }), TRANSLATING)).toEqual([]);
    });

    it('says nothing about a unit the file marks untranslatable (§5.4)', () => {
        const over = { translate: false, source: 'Uses %1', target: 'Uses nothing' };
        expect(hintsFor(unit(over), TRANSLATING)).toEqual([]);
        expect(kinds(hintsFor(unit({ ...over, translate: true }), TRANSLATING))).toEqual([HintKind.placeholders]);
    });
});

describe('the maxwidth check', () => {
    it('counts characters against what the file allows', () => {
        const over = { maxwidth: 10, sizeUnit: 'char', target: 'elf Zeichen!' };

        expect(only(hintsFor(unit(over), TRANSLATING), HintKind.maxwidth).message).toBe('This target is 12 characters; the file allows 10.');
        expect(hintsFor(unit({ ...over, target: '0123456789' }), TRANSLATING)).toEqual([]);
    });

    it('stays quiet when maxwidth is not counting characters', () => {
        // XLIFF 1.2 defaults `size-unit` to `pixel`, which we cannot measure. AL writes
        // `char` on every unit, so the check runs where it means something and nowhere else.
        const long = { maxwidth: 2, target: 'far longer than two' };

        expect(hintsFor(unit({ ...long, sizeUnit: undefined }), TRANSLATING)).toEqual([]);
        expect(hintsFor(unit({ ...long, sizeUnit: 'pixel' }), TRANSLATING)).toEqual([]);
        expect(kinds(hintsFor(unit({ ...long, sizeUnit: 'char' }), TRANSLATING))).toEqual([HintKind.maxwidth]);
    });
});

describe('the placeholder check', () => {
    it('names the ones the target dropped', () => {
        const hints = hintsFor(unit({ source: 'From %1 to %2', target: 'Ab %1' }), TRANSLATING);
        expect(only(hints, HintKind.placeholders).message).toBe('The source uses %2; the target does not.');
    });

    it('names the ones the target invented', () => {
        const hints = hintsFor(unit({ source: 'VAT Base', target: 'MwSt.-Basis %1' }), TRANSLATING);
        expect(only(hints, HintKind.placeholders).message).toBe('The target uses %1; the source does not.');
    });

    it('says both when both are true', () => {
        const hints = hintsFor(unit({ source: 'Uses %1 and %2', target: 'Nutzt #1 und %2' }), TRANSLATING);
        expect(only(hints, HintKind.placeholders).message).toBe('The source uses %1 and the target uses #1 instead.');
    });

    it('compares them as sets, so reordering and repeating are not mistakes', () => {
        // §12.4 asks for "present in source but missing from target, or vice versa". A
        // corpus unit deliberately uses each of %1…%4 twice; counting would flag it.
        expect(hintsFor(unit({ source: 'Bin: %1 - Max: %2', target: 'Max: %2 %2 - Bin: %1 %1' }), TRANSLATING)).toEqual([]);
    });

    it('reads #1 as a placeholder too, since §12.4 lists it', () => {
        expect(kinds(hintsFor(unit({ source: 'Row #1', target: 'Zeile' }), TRANSLATING))).toEqual([HintKind.placeholders]);
    });
});

describe('the empty-but-finished check', () => {
    it('fires only when the file itself claims the work is done', () => {
        const empty = { target: '', state: XliffState.empty };

        for (const declared of [XliffState.translated, XliffState.signedOff, XliffState.final]) {
            expect(kinds(hintsFor(unit({ ...empty, declaredState: declared }), TRANSLATING))).toEqual([HintKind.statedButEmpty]);
        }
        expect(hintsFor(unit({ ...empty, declaredState: XliffState.needsTranslation }), TRANSLATING)).toEqual([]);
        expect(hintsFor(unit(empty), TRANSLATING)).toEqual([]);
    });

    it('quotes the state the file declared, which is the whole point of the hint', () => {
        const hints = hintsFor(unit({ target: '', state: XliffState.empty, declaredState: XliffState.signedOff }), TRANSLATING);
        expect(only(hints, HintKind.statedButEmpty).message).toBe('This target is empty, but the file declares it signed-off.');
    });
});

describe('the same-as-source check (DEC-037)', () => {
    const same = { source: 'Contoso', target: 'Contoso' };

    it('is off unless it is asked for', () => {
        expect(hintsFor(unit(same), TRANSLATING)).toEqual([]);
        expect(kinds(hintsFor(unit(same), { ...TRANSLATING, sameAsSource: true }))).toEqual([HintKind.sameAsSource]);
    });

    it('stays quiet when the file translates a language into itself', () => {
        // `Contoso App.en-US.xlf` declares en-US on both sides and repeats its source in
        // all 1098 units. Saying so 1098 times helps nobody.
        const asked = { sourceLanguage: 'en-US', targetLanguage: 'en-US', sameAsSource: true };

        expect(hintsFor(unit(same), asked)).toEqual([]);
        expect(hintsFor(unit(same), { ...asked, targetLanguage: undefined })).toEqual([]);
    });
});

describe('the corpus, which is what the hints have to be quiet on', () => {
    // Read the way `App.test.ts` reads sources: this project runs under jsdom, where
    // `import.meta.url` is not a file URL and `node:fs` has nothing to resolve against.
    const files: Record<string, string> = import.meta.glob('../../../Examples/*.xlf', { query: '?raw', import: 'default', eager: true });

    it('finds exactly one placeholder mistake in 5806 units, and no false maxwidth', () => {
        // Measured through the real parser and the real projection, not a regex over the
        // text. The corpus carries one `maxwidth` and its target fits inside it — the plan's
        // acceptance criterion expected an overrun that is not there.
        const counts: Record<string, number> = { placeholders: 0, maxwidth: 0, sameAsSource: 0, statedButEmpty: 0 };
        let units = 0;

        for (const [path, text] of Object.entries(files)) {
            const name = path.split('/').pop() ?? path;
            const dto = projectDocument(parseXliff(text), { uri: `file:///${name}`, fileName: name });
            for (const file of dto.files) {
                for (const unitDto of file.units) {
                    units++;
                    for (const hint of hintsFor(unitDto, { sourceLanguage: file.sourceLanguage, targetLanguage: file.targetLanguage, sameAsSource: true })) {
                        counts[hint.kind]++;
                    }
                }
            }
        }

        expect(units).toBe(5806);
        expect(counts.placeholders).toBe(1);
        expect(counts.maxwidth).toBe(0);
        expect(counts.statedButEmpty).toBe(0);
        // Off by default for exactly this reason: a tenth of a real translation file is
        // legitimately identical, and en-US against en-US is not a translation at all.
        expect(counts.sameAsSource).toBe(304);
    });

    it('is quiet on a base file, which has no targets to be wrong about', () => {
        const text = files[Object.keys(files).find(path => path.endsWith('.g.xlf')) ?? ''];
        const dto = projectDocument(parseXliff(text), { uri: 'file:///base.g.xlf', fileName: 'base.g.xlf' });

        const flagged = dto.files.flatMap(file => file.units).filter(unitDto => hintsFor(unitDto, { ...TRANSLATING, sameAsSource: true }).length > 0);

        expect(flagged).toEqual([]);
    });
});

describe('the roll-up and the setting', () => {
    const flagged = unit({ id: 'Table 1 - Property 2', source: 'Uses %1', target: 'Nutzt nichts' });
    const clean = unit({ id: 'Table 1 - Property 3', source: 'Plain', target: 'Einfach' });

    const tree: AlNodeDto[] = [{
        key: 'Table 1',
        type: 'Table',
        name: 'Object',
        children: [
            { key: flagged.id, type: 'Property', name: 'One', children: [] },
            { key: clean.id, type: 'Property', name: 'Two', children: [] },
        ],
    }];

    const file: XliffFileDto = { index: 0, sourceLanguage: 'en-US', targetLanguage: 'de-DE', tree, units: [flagged, clean], hasAlIds: true };

    const validate = (settings: Partial<WebviewSettings> = {}) => useValidation({
        file: computed(() => file),
        settings: ref({ ...DEFAULT_WEBVIEW_SETTINGS, ...settings }),
    });

    it('maps only the units that have something to say', () => {
        const validation = validate();

        expect([...validation.byUnit.value.keys()]).toEqual([flagged.id]);
    });

    it('counts units, not hints, all the way up the tree', () => {
        const both = unit({ id: clean.id, source: 'Uses %1', target: 'x'.repeat(80), maxwidth: 4, sizeUnit: 'char' });
        const validation = useValidation({
            file: computed(() => ({ ...file, units: [flagged, both] })),
            settings: ref(DEFAULT_WEBVIEW_SETTINGS),
        });

        expect(validation.byUnit.value.get(both.id)).toHaveLength(2);
        // Two units below, three hints between them, and the container says two.
        expect(validation.countByKey.value.get('Table 1')).toBe(2);
    });

    it('leaves a clean branch out of the map rather than mapping it to zero', () => {
        const validation = validate();

        expect(validation.countByKey.value.get(clean.id)).toBeUndefined();
        expect(validation.countByKey.value.get('Table 1')).toBe(1);
    });

    it('produces nothing at all when the setting is off', () => {
        const validation = validate({ validationEnabled: false });

        expect(validation.byUnit.value.size).toBe(0);
        expect(validation.countByKey.value.size).toBe(0);
    });

    it('follows the setting when it changes, without being rebuilt', () => {
        const settings = ref<WebviewSettings>({ ...DEFAULT_WEBVIEW_SETTINGS, validationEnabled: false });
        const validation = useValidation({ file: computed(() => file), settings });

        expect(validation.byUnit.value.size).toBe(0);
        settings.value = { ...settings.value, validationEnabled: true };
        expect(validation.byUnit.value.size).toBe(1);
    });
});

describe('where a hint appears', () => {
    const hints: readonly Hint[] = [
        { kind: HintKind.placeholders, message: 'The source uses %1; the target does not.' },
        { kind: HintKind.maxwidth, message: 'This target is 12 characters; the file allows 10.' },
    ];

    it('is under the unit it is about, one line each', () => {
        const wrapper = mount(UnitCard, { props: { unit: unit(), settings: DEFAULT_WEBVIEW_SETTINGS, hints } });

        expect(wrapper.findAll('.hint').map(each => each.text())).toEqual([
            '⚠The source uses %1; the target does not.',
            '⚠This target is 12 characters; the file allows 10.',
        ]);
    });

    it('is absent, not empty, when the unit has nothing wrong with it', () => {
        const wrapper = mount(UnitCard, { props: { unit: unit(), settings: DEFAULT_WEBVIEW_SETTINGS, hints: [] } });

        expect(wrapper.find('.hints').exists()).toBe(false);
    });

    it('is a count on a container row, and says what the count means', () => {
        const row = { key: 'Table 1', type: 'Table', name: 'Object', depth: 0, hasChildren: true, expanded: false, position: 1, siblings: 1 };
        const wrapper = mount(TreeRow, {
            props: { row, focused: false, hintCount: 3 },
            global: { provide: { [UNIT_ACTIONS_KEY as symbol]: { open: () => { }, baseFileName: () => undefined } } },
        });

        expect(wrapper.get('.hint-count').text()).toBe('⚠3');
        expect(wrapper.get('.hint-count').attributes('title')).toBe('3 translations below this one have something worth checking.');
    });

    it('says it in the singular when there is one', () => {
        const row = { key: 'Table 1', type: 'Table', name: 'Object', depth: 0, hasChildren: true, expanded: false, position: 1, siblings: 1 };
        const wrapper = mount(TreeRow, {
            props: { row, focused: false, hintCount: 1 },
            global: { provide: { [UNIT_ACTIONS_KEY as symbol]: { open: () => { }, baseFileName: () => undefined } } },
        });

        expect(wrapper.get('.hint-count').attributes('title')).toBe('1 translation below this one has something worth checking.');
    });

    it('shows no count at all on a branch with nothing to flag', () => {
        const row = { key: 'Table 1', type: 'Table', name: 'Object', depth: 0, hasChildren: true, expanded: false, position: 1, siblings: 1 };
        const wrapper = mount(TreeRow, {
            props: { row, focused: false },
            global: { provide: { [UNIT_ACTIONS_KEY as symbol]: { open: () => { }, baseFileName: () => undefined } } },
        });

        expect(wrapper.find('.hint-count').exists()).toBe(false);
    });

    it('does not repeat the count on the unit whose card already says it', () => {
        // The count is for a branch you cannot see into. On the row itself it sits beside a
        // card that has just spelled the same hint out in a sentence.
        const unitRow = {
            key: 'Table 1 - Property 2', type: 'Property', name: 'Caption', depth: 1,
            hasChildren: false, expanded: false, position: 1, siblings: 1, unit: unit(),
        };
        const wrapper = mount(TreeRow, {
            props: { row: unitRow, focused: false, settings: DEFAULT_WEBVIEW_SETTINGS, hintCount: 1, hints },
            global: { provide: { [UNIT_ACTIONS_KEY as symbol]: { open: () => { }, baseFileName: () => undefined } } },
        });

        expect(wrapper.find('.hint-count').exists()).toBe(false);
        expect(wrapper.findAll('.hint')).toHaveLength(2);
    });
});

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, h, nextTick, ref } from 'vue';

import Toolbar from '../../webview/components/Toolbar.vue';
import UnitCard from '../../webview/components/UnitCard.vue';
import { EditRefusal, useEditMode } from '../../webview/composables/useEditMode';
import { useSearch } from '../../webview/composables/useSearch';
import { useStateFilter } from '../../webview/composables/useStateFilter';
import { stateLabel } from '../../webview/stateTone';
import { UNIT_ACTIONS_KEY } from '../../webview/unitActions';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { SPEC_STATES, summariseUnits, XliffState } from '../../shared/state';
import { documentDto, exampleUnitDto, fileDto } from '../support/dtoBuilders';
import { withSetup } from './support/withSetup';

import type { TransUnitDto, XliffDocumentDto } from '../../shared/dto';
import type { WebviewSettings } from '../../shared/settings';

const FILE = fileDto({ units: [exampleUnitDto()] });

const DOCUMENT = documentDto([FILE]);

/**
 * `useEditMode`, and the toolbar it drives when a test asks for one. The document and the
 * settings change as the host would change them, and take effect before the next assertion.
 */
function editMode(document: XliffDocumentDto = DOCUMENT, settings: WebviewSettings = DEFAULT_WEBVIEW_SETTINGS, withToolbar = false) {
    const documentRef = ref(document);
    const settingsRef = ref(settings);
    const { result, wrapper } = withSetup(() => {
        const file = ref(FILE);
        return {
            edit: useEditMode({ document: computed(() => documentRef.value), settings: computed(() => settingsRef.value) }),
            search: useSearch({ file: computed(() => file.value), unitsById: computed(() => new Map()) }),
            filter: useStateFilter({
                summary: computed(() => summariseUnits(file.value.units)),
                unitsById: computed(() => new Map()),
                scope: computed(() => 'one'),
            }),
        };
    }, ({ edit, search, filter }) => (withToolbar ? h(Toolbar, { search, filter, edit }) : null));
    const setSettings = async (next: WebviewSettings): Promise<void> => {
        settingsRef.value = next;
        await nextTick();
    };
    const setDocument = async (next: XliffDocumentDto): Promise<void> => {
        documentRef.value = next;
        await nextTick();
    };
    return { edit: result.edit, wrapper, setSettings, setDocument };
}

describe('whether editing is possible at all', () => {
    it('is off by default, and says so rather than nothing', () => {
        const { edit } = editMode();

        expect(edit.active.value).toBe(false);
        expect(edit.refusal.value).toBe(EditRefusal.off);
        expect(edit.reason.value).toContain('Turn it on');
    });

    it('starts on when the setting says so', () => {
        const { edit } = editMode(DOCUMENT, { ...DEFAULT_WEBVIEW_SETTINGS, editMode: true });

        expect(edit.active.value).toBe(true);
        expect(edit.reason.value).toBeUndefined();
    });

    it('lets the toggle override the setting, and re-seeds when the setting itself changes', async () => {
        const { edit, setSettings } = editMode();

        edit.toggle();
        expect(edit.active.value).toBe(true);

        // Settings arrive again for every configuration change; another one must not undo the toggle.
        await setSettings({ ...DEFAULT_WEBVIEW_SETTINGS, editMode: false, showGeneratorNotes: true });
        expect(edit.active.value).toBe(true);

        await setSettings({ ...DEFAULT_WEBVIEW_SETTINGS, editMode: true });
        expect(edit.wanted.value).toBe(true);

        await setSettings({ ...DEFAULT_WEBVIEW_SETTINGS, editMode: false });
        expect(edit.wanted.value).toBe(false);
    });

    it('names the base file as the reason, not merely "read-only"', () => {
        const { edit } = editMode({ ...DOCUMENT, isBaseFile: true, readOnly: true });

        expect(edit.available.value).toBe(false);
        expect(edit.refusal.value).toBe(EditRefusal.baseFile);
        expect(edit.reason.value).toContain('AL compiler');
    });

    it('tells a read-only file apart from a base file', () => {
        const { edit } = editMode({ ...DOCUMENT, readOnly: true });

        expect(edit.refusal.value).toBe(EditRefusal.readOnly);
        expect(edit.reason.value).toBe('This file is read-only.');
    });

    it('gives the host\'s own reason for a file it cannot write back', () => {
        const readOnlyReason = 'This file contains XML comments, which this editor cannot write back. Edit it as text instead.';
        const { edit } = editMode({ ...DOCUMENT, readOnly: true, readOnlyReason });

        expect(edit.refusal.value).toBe(EditRefusal.readOnly);
        expect(edit.reason.value).toBe(readOnlyReason);
    });

    it('cannot be toggled on where the document forbids it', () => {
        const { edit } = editMode({ ...DOCUMENT, readOnly: true });

        edit.toggle();

        expect(edit.active.value).toBe(false);
    });
});

describe('the toggle in the toolbar', () => {
    function toolbar(document?: XliffDocumentDto) {
        const { edit, wrapper } = editMode(document, DEFAULT_WEBVIEW_SETTINGS, true);
        return { wrapper, button: wrapper.get('.edit-toggle'), edit };
    }

    it('turns editing on and says which state it is in', async () => {
        const { button, edit } = toolbar();

        expect(button.attributes('aria-pressed')).toBe('false');
        await button.trigger('click');

        expect(edit.active.value).toBe(true);
        expect(button.attributes('aria-pressed')).toBe('true');
    });

    it('is disabled on a document that cannot be edited, with the reason on it', () => {
        const { button } = toolbar({ ...DOCUMENT, isBaseFile: true, readOnly: true });

        expect(button.attributes('disabled')).toBeDefined();
        expect(button.attributes('title')).toContain('AL compiler');
    });

    it('carries the host\'s reason when the file cannot be written back', () => {
        const readOnlyReason = 'This file contains a CDATA section, which this editor cannot write back. Edit it as text instead.';
        const { button } = toolbar({ ...DOCUMENT, readOnly: true, readOnlyReason });

        expect(button.attributes('disabled')).toBeDefined();
        expect(button.attributes('title')).toBe(readOnlyReason);
    });
});

describe('remembering a state the reader chose', () => {
    it('has nothing to remember until one is chosen', () => {
        const { edit } = editMode();

        expect(edit.chosenState(0, 'Table 1 - Property 2')).toBeUndefined();
    });

    it('remembers per unit, not for the file', () => {
        const { edit } = editMode();

        edit.rememberState(0, 'Table 1 - Property 2', XliffState.needsReviewTranslation);

        expect(edit.chosenState(0, 'Table 1 - Property 2')).toBe(XliffState.needsReviewTranslation);
        expect(edit.chosenState(0, 'Table 1 - Property 3')).toBeUndefined();
    });

    it('keeps the choices for one id in two <file> elements apart', () => {
        const { edit } = editMode();

        edit.rememberState(0, 'Table 1 - Property 2', XliffState.signedOff);
        edit.rememberState(1, 'Table 1 - Property 2', XliffState.needsReviewTranslation);

        expect(edit.chosenState(0, 'Table 1 - Property 2')).toBe(XliffState.signedOff);
        expect(edit.chosenState(1, 'Table 1 - Property 2')).toBe(XliffState.needsReviewTranslation);
        expect(edit.chosenState(2, 'Table 1 - Property 2')).toBeUndefined();
    });

    it('forgets when a different document arrives', async () => {
        // Unit ids repeat across files, so a choice made in one document must not follow
        // the reader into the next.
        const { edit, setDocument } = editMode();
        edit.rememberState(0, 'Table 1 - Property 2', XliffState.signedOff);

        await setDocument({ ...DOCUMENT, uri: 'file:///w/Other.de-DE.xlf' });

        expect(edit.chosenState(0, 'Table 1 - Property 2')).toBeUndefined();
    });

    it('keeps the choice across a re-parse of the same document', async () => {
        const { edit, setDocument } = editMode();
        edit.rememberState(0, 'Table 1 - Property 2', XliffState.signedOff);

        await setDocument({ ...DOCUMENT, files: [{ ...FILE, units: [exampleUnitDto({ target: 'Edited' })] }] });

        expect(edit.chosenState(0, 'Table 1 - Property 2')).toBe(XliffState.signedOff);
    });
});

describe('the card in edit mode', () => {
    function card(over: Partial<TransUnitDto> = {}, editing = true) {
        const calls: { what: string; unitId: string; value: string }[] = [];
        const wrapper = mount(UnitCard, {
            props: { unit: exampleUnitDto(over), settings: DEFAULT_WEBVIEW_SETTINGS, editing, name: 'Caption' },
            global: {
                provide: {
                    [UNIT_ACTIONS_KEY as symbol]: {
                        open: () => { },
                        baseFileName: () => 'App.g.xlf',
                        updateTarget: (unitId: string, value: string) => calls.push({ what: 'target', unitId, value }),
                        updateState: (unitId: string, value: string) => calls.push({ what: 'state', unitId, value }),
                    },
                },
            },
        });
        return { wrapper, calls };
    }

    it('renders text and no input at all when editing is off', () => {
        // Not a *disabled* input: that says "you could change this but may not", which is
        // the wrong message in a viewer.
        const { wrapper } = card({}, false);

        expect(wrapper.find('textarea').exists()).toBe(false);
        expect(wrapper.find('select').exists()).toBe(false);
        expect(wrapper.get('.target').text()).toBe('ExampleTranslation');
    });

    it('swaps the text for a labelled field when editing is on', () => {
        const { wrapper } = card();
        const field = wrapper.get('textarea');

        expect((field.element as HTMLTextAreaElement).value).toBe('ExampleTranslation');
        expect(wrapper.get('label').attributes('for')).toBe(field.attributes('id'));
    });

    it('commits on blur, and says nothing when the field still matches the unit', async () => {
        // The comparison is against the unit, not against a remembered keystroke: once the
        // host's patch has come back, blurring again has nothing to say. Per-keystroke
        // posting would make every character its own undo step.
        const { wrapper, calls } = card();
        const field = wrapper.get('textarea');

        (field.element as HTMLTextAreaElement).value = 'EditedTranslation';
        await field.trigger('blur');
        expect(calls).toEqual([{ what: 'target', unitId: 'Table 1 - Property 2', value: 'EditedTranslation' }]);

        // What `patchUnits` does when the edit lands.
        await wrapper.setProps({ unit: exampleUnitDto({ target: 'EditedTranslation' }) });
        await field.trigger('blur');

        expect(calls).toHaveLength(1);
    });

    it('shows the saved values again when the host sends the unit back unchanged', async () => {
        // What the host does when it refuses an edit: the same values, as a new object.
        const { wrapper } = card();
        const field = wrapper.get('textarea').element as HTMLTextAreaElement;
        const state = wrapper.get('select').element as HTMLSelectElement;
        field.value = 'TypedTranslation';
        state.value = XliffState.signedOff;

        await wrapper.setProps({ unit: exampleUnitDto() });

        expect(field.value).toBe('ExampleTranslation');
        expect(state.value).toBe(XliffState.translated);
    });

    it('says nothing at all when the field was never touched', async () => {
        const { wrapper, calls } = card();

        await wrapper.get('textarea').trigger('blur');

        expect(calls).toEqual([]);
    });

    it('does not eat a target that is nothing but a space', () => {
        const { wrapper } = card({ target: ' ', state: XliffState.translated });

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(' ');
    });

    it('commits a space-only target without trimming it', async () => {
        const { wrapper, calls } = card();
        const field = wrapper.get('textarea');

        (field.element as HTMLTextAreaElement).value = ' ';
        await field.trigger('blur');

        expect(calls).toEqual([{ what: 'target', unitId: 'Table 1 - Property 2', value: ' ' }]);
    });

    it('abandons what was typed on Escape', async () => {
        const { wrapper, calls } = card();
        const field = wrapper.get('textarea');

        (field.element as HTMLTextAreaElement).value = 'AbandonedTranslation';
        await field.trigger('keydown.esc');

        expect((field.element as HTMLTextAreaElement).value).toBe('ExampleTranslation');
        expect(calls).toEqual([]);
    });

    it('grows for a multi-line target rather than hiding it in one row', () => {
        const { wrapper } = card({ target: 'one\ntwo\nthree' });

        expect(wrapper.get('textarea').attributes('rows')).toBe('3');
    });

    it('starts at least as wide as the source it translates', () => {
        // A floor rather than a width: `field-sizing: content` does the sizing, and it does
        // it as the reader types. An `inline-size` here would freeze the field instead.
        const short = card({ source: 'Ab', target: 'Cd' });
        const long = card({ source: 'A'.repeat(40), target: 'Cd' });

        expect(short.wrapper.get('textarea').attributes('style')).toContain('min-inline-size: 24ch');
        expect(long.wrapper.get('textarea').attributes('style')).toContain('min-inline-size: 40ch');
        // A width, rather than a floor, is what would freeze the field at its old value.
        expect((short.wrapper.get('textarea').element as HTMLTextAreaElement).style.inlineSize).toBe('');
    });

    it('gives an empty target the room its source says it needs', () => {
        const { wrapper } = card({ source: 'A'.repeat(50), target: undefined });

        expect(wrapper.get('textarea').attributes('style')).toContain('min-inline-size: 50ch');
    });

    it('stops widening rather than becoming a wall of text', () => {
        const { wrapper } = card({ source: 'A'.repeat(400) });

        expect(wrapper.get('textarea').attributes('style')).toContain('min-inline-size: 72ch');
    });

    it('can be folded down to one line, and no further', () => {
        // `resize: vertical` has no floor of its own, so a drag can take a field to nothing.
        // One line rather than the height it opened at: a long target is worth folding away
        // when it is not the one being read.
        const one = card({ target: 'OneLine' });
        const three = card({ target: 'one\ntwo\nthree' });

        expect(one.wrapper.get('textarea').attributes('style')).toContain('min-block-size: calc(1lh');
        expect(three.wrapper.get('textarea').attributes('style')).toContain('min-block-size: calc(1lh');
        expect(three.wrapper.get('textarea').attributes('rows')).toBe('3');
    });

    /** jsdom lays nothing out, so the field is told what it would have measured. */
    function measuring(field: HTMLTextAreaElement, scrollHeight: number, clientHeight: number, border = 2): void {
        Object.defineProperty(field, 'scrollHeight', { configurable: true, get: () => scrollHeight });
        Object.defineProperty(field, 'clientHeight', { configurable: true, get: () => clientHeight });
        Object.defineProperty(field, 'offsetHeight', { configurable: true, get: () => clientHeight + border });
    }

    it('re-fits its height to what was typed, not to what it was given', async () => {
        const { wrapper } = card({ target: 'one line' });
        const field = wrapper.get('textarea').element as HTMLTextAreaElement;
        measuring(field, 88, 88);

        field.value = 'one\ntwo\nthree\nfour';
        await wrapper.get('textarea').trigger('input');

        // 88 of content and padding, the 2 of border that `border-box` counts, and the
        // pixel that covers `scrollHeight` having rounded.
        expect(field.style.blockSize).toBe('91px');
    });

    it('rounds up rather than leaving a scrollbar where half a line should be', async () => {
        // `scrollHeight` is an integer rounding of a height that is not one, and
        // `clientHeight` is rounded the same way — so a field can overflow by a fraction
        // while the DOM reports that it does not. The pixel is what covers that.
        const { wrapper } = card({ target: 'one line' });
        const field = wrapper.get('textarea').element as HTMLTextAreaElement;
        measuring(field, 40, 40);

        await wrapper.get('textarea').trigger('input');

        expect(field.style.blockSize).toBe('43px');
    });

    it('opens a wrapped target at its full height, before a key is ever pressed', () => {
        // The field lives in a virtualiser, so it mounts as the tree scrolls. `rows` counts
        // the target's own line breaks and knows nothing about the ones wrapping adds.
        const measured = new WeakSet<HTMLTextAreaElement>();
        const scrollHeight = vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function measure(this: HTMLTextAreaElement) {
            measured.add(this);
            return 56;
        });

        try {
            const { wrapper } = card({ target: 'a target long enough to wrap' });
            const field = wrapper.get('textarea').element as HTMLTextAreaElement;

            expect(measured.has(field)).toBe(true);
            expect(field.style.blockSize).not.toBe('');
        } finally {
            scrollHeight.mockRestore();
        }

        expect(document.createElement('textarea').scrollHeight).toBe(0);
    });

    it('offers exactly the ten states the spec defines, and none of the synthetic ones', () => {
        const { wrapper } = card();
        const options = wrapper.findAll('option').map(each => each.attributes('value'));

        expect(options).toEqual([...SPEC_STATES]);
        expect(options).toHaveLength(10);
        expect(options).not.toContain(XliffState.missing);
        expect(options).not.toContain(XliffState.empty);
        expect(options).not.toContain(XliffState.unknown);
    });

    it('shows a synthetic state as an unselectable placeholder rather than pretending it is a choice', () => {
        const { wrapper } = card({ target: undefined, state: XliffState.missing });
        const [first] = wrapper.findAll('option');

        expect(first.attributes('disabled')).toBeDefined();
        expect(first.text()).toBe(stateLabel(XliffState.missing));
        expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('');
    });

    it('posts the state the reader picked', async () => {
        const { wrapper, calls } = card();
        const select = wrapper.get('select');

        (select.element as HTMLSelectElement).value = XliffState.needsReviewTranslation;
        await select.trigger('change');

        expect(calls).toEqual([{ what: 'state', unitId: 'Table 1 - Property 2', value: XliffState.needsReviewTranslation }]);
    });

    it('labels the state control, since a bare dropdown says nothing', () => {
        const { wrapper } = card();

        expect(wrapper.get('select').attributes('aria-label')).toBe('Translation state of Caption');
    });
});

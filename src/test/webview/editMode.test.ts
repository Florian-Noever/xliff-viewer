import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { computed, defineComponent, ref } from 'vue';

import Toolbar from '../../webview/components/Toolbar.vue';
import UnitCard from '../../webview/components/UnitCard.vue';
import { EditRefusal, useEditMode } from '../../webview/composables/useEditMode';
import { useSearch } from '../../webview/composables/useSearch';
import { useStateFilter } from '../../webview/composables/useStateFilter';
import { stateLabel } from '../../webview/stateTone';
import { UNIT_ACTIONS_KEY } from '../../webview/unitActions';

import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { SPEC_STATES, summariseUnits, XliffState } from '../../shared/state';

import type { TransUnitDto, XliffDocumentDto, XliffFileDto } from '../../shared/dto';
import type { WebviewSettings } from '../../shared/settings';
import type { EditMode } from '../../webview/composables/useEditMode';

/**
 * `EDIT-03`. Read-only is the default; editing is opt-in, and every refusal says which of
 * §12.5's reasons applies rather than leaving the reader to guess.
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

const FILE: XliffFileDto = {
    index: 0,
    sourceLanguage: 'en-US',
    targetLanguage: 'de-DE',
    tree: [],
    units: [unit()],
    hasAlIds: true,
};

const DOCUMENT: XliffDocumentDto = {
    uri: 'file:///w/App.de-DE.xlf',
    fileName: 'App.de-DE.xlf',
    isBaseFile: false,
    readOnly: false,
    files: [FILE],
};

/**
 * Mounts `useEditMode` — it holds a `watch`, so it needs a real scope — and optionally a
 * toolbar driven by it. One host component for both, because two would be two components
 * in one file for no gain.
 */
const Host = defineComponent({
    components: { Toolbar },
    props: {
        document: { type: Object as () => XliffDocumentDto | undefined, default: undefined },
        settings: { type: Object as () => WebviewSettings, required: true },
        withToolbar: { type: Boolean, default: false },
    },
    setup(hostProps, { expose }) {
        const documentRef = computed(() => hostProps.document);
        const settingsRef = computed(() => hostProps.settings);
        const edit = useEditMode({ document: documentRef, settings: settingsRef });
        const file = ref(FILE);
        const search = useSearch({ file: computed(() => file.value), unitsById: computed(() => new Map()) });
        const filter = useStateFilter({
            summary: computed(() => summariseUnits(file.value.units)),
            unitsById: computed(() => new Map()),
            scope: computed(() => 'one'),
        });
        expose({ edit });
        return { search, filter, edit };
    },
    template: '<Toolbar v-if="withToolbar" :search="search" :filter="filter" :edit="edit" />',
});

function editMode(document?: XliffDocumentDto, settings: WebviewSettings = DEFAULT_WEBVIEW_SETTINGS, withToolbar = false) {
    const wrapper = mount(Host, { props: { document: document ?? DOCUMENT, settings, withToolbar } });
    const edit = (wrapper.vm as unknown as { edit: EditMode }).edit;
    const settingsRef = {
        set value(next: WebviewSettings) {
            void wrapper.setProps({ settings: next });
        },
    };
    return { edit, wrapper, settingsRef };
}

describe('whether editing is possible at all', () => {
    it('is off by default, and says so rather than nothing (§11.3)', () => {
        const { edit } = editMode();

        expect(edit.active.value).toBe(false);
        expect(edit.refusal.value).toBe(EditRefusal.off);
        expect(edit.reason.value).toContain('Turn it on');
    });

    it('starts on when the setting says so (§13)', () => {
        const { edit } = editMode(DOCUMENT, { ...DEFAULT_WEBVIEW_SETTINGS, editMode: true });

        expect(edit.active.value).toBe(true);
        expect(edit.reason.value).toBeUndefined();
    });

    it('lets the toggle override the setting, and re-seeds when the setting changes', () => {
        const { edit, settingsRef } = editMode();

        edit.toggle();
        expect(edit.active.value).toBe(true);

        settingsRef.value = { ...DEFAULT_WEBVIEW_SETTINGS, editMode: false };
        expect(edit.active.value).toBe(true);

        settingsRef.value = { ...DEFAULT_WEBVIEW_SETTINGS, editMode: true };
        expect(edit.wanted.value).toBe(true);
    });

    it('names the base file as the reason, not merely "read-only" (DEC-011)', () => {
        const { edit } = editMode({ ...DOCUMENT, isBaseFile: true, readOnly: true });

        expect(edit.available.value).toBe(false);
        expect(edit.refusal.value).toBe(EditRefusal.baseFile);
        expect(edit.reason.value).toContain('AL compiler');
    });

    it('tells a read-only file apart from a base file (§12.5)', () => {
        const { edit } = editMode({ ...DOCUMENT, readOnly: true });

        expect(edit.refusal.value).toBe(EditRefusal.readOnly);
        expect(edit.reason.value).toBe('This file is read-only.');
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

    it('is disabled on a document that cannot be edited, with the reason on it (§12.5)', () => {
        const { button } = toolbar({ ...DOCUMENT, isBaseFile: true, readOnly: true });

        expect(button.attributes('disabled')).toBeDefined();
        expect(button.attributes('title')).toContain('AL compiler');
    });
});

describe('remembering a state the reader chose (EDIT-04, §12.3)', () => {
    it('has nothing to remember until one is chosen', () => {
        const { edit } = editMode();

        expect(edit.chosenState('Table 1 - Property 2')).toBeUndefined();
    });

    it('remembers per unit, not for the file', () => {
        const { edit } = editMode();

        edit.rememberState('Table 1 - Property 2', XliffState.needsReviewTranslation);

        expect(edit.chosenState('Table 1 - Property 2')).toBe(XliffState.needsReviewTranslation);
        expect(edit.chosenState('Table 1 - Property 3')).toBeUndefined();
    });

    it('forgets when a different document arrives', async () => {
        // §12.3 scopes the exception to "the same session", and unit ids repeat across
        // files — a choice made in one document must not follow the reader into the next.
        const { edit, wrapper } = editMode();
        edit.rememberState('Table 1 - Property 2', XliffState.signedOff);

        await wrapper.setProps({ document: { ...DOCUMENT, uri: 'file:///w/Other.de-DE.xlf' } });

        expect(edit.chosenState('Table 1 - Property 2')).toBeUndefined();
    });

    it('keeps the choice across a re-parse of the same document', async () => {
        const { edit, wrapper } = editMode();
        edit.rememberState('Table 1 - Property 2', XliffState.signedOff);

        await wrapper.setProps({ document: { ...DOCUMENT, files: [{ ...FILE, units: [unit({ target: 'Edited' })] }] } });

        expect(edit.chosenState('Table 1 - Property 2')).toBe(XliffState.signedOff);
    });
});

describe('the card in edit mode', () => {
    function card(over: Partial<TransUnitDto> = {}, editing = true) {
        const calls: { what: string; unitId: string; value: string }[] = [];
        const wrapper = mount(UnitCard, {
            props: { unit: unit(over), settings: DEFAULT_WEBVIEW_SETTINGS, editing, name: 'Caption' },
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

    it('renders text and no input at all when editing is off (§11.3)', () => {
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
        await wrapper.setProps({ unit: unit({ target: 'EditedTranslation' }) });
        await field.trigger('blur');

        expect(calls).toHaveLength(1);
    });

    it('says nothing at all when the field was never touched', async () => {
        const { wrapper, calls } = card();

        await wrapper.get('textarea').trigger('blur');

        expect(calls).toEqual([]);
    });

    it('does not eat a target that is nothing but a space (DEC-021)', () => {
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

    it('grows for a multi-line target rather than hiding it in one row (§12.2)', () => {
        const { wrapper } = card({ target: 'one\ntwo\nthree' });

        expect(wrapper.get('textarea').attributes('rows')).toBe('3');
    });


    it('starts at least as wide as the source it translates (EDIT-03a)', () => {
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

    it('can be folded down to one line, and no further (EDIT-03a)', () => {
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

    it('re-fits its height to what was typed, not to what it was given (EDIT-03a)', async () => {
        const { wrapper } = card({ target: 'one line' });
        const field = wrapper.get('textarea').element as HTMLTextAreaElement;
        measuring(field, 88, 88);

        field.value = 'one\ntwo\nthree\nfour';
        await wrapper.get('textarea').trigger('input');

        // 88 of content and padding, the 2 of border that `border-box` counts, and the
        // pixel that covers `scrollHeight` having rounded.
        expect(field.style.blockSize).toBe('91px');
    });

    it('rounds up rather than leaving a scrollbar where half a line should be (EDIT-03a)', async () => {
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
        const heights = new WeakMap<HTMLTextAreaElement, boolean>();
        const original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight');
        Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
            configurable: true,
            get(this: HTMLTextAreaElement) {
                heights.set(this, true);
                return 56;
            },
        });

        try {
            const { wrapper } = card({ target: 'a target long enough to wrap' });
            const field = wrapper.get('textarea').element as HTMLTextAreaElement;

            expect(heights.get(field)).toBe(true);
            expect(field.style.blockSize).not.toBe('');
        } finally {
            if (original !== undefined) {
                Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', original);
            }
        }
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

    it('labels the state control, since a bare dropdown says nothing (§11.7)', () => {
        const { wrapper } = card();

        expect(wrapper.get('select').attributes('aria-label')).toBe('Translation state of Caption');
    });
});

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, nextTick } from 'vue';

import { useXliffDocument } from '../../webview/composables/useXliffDocument';
import { ExtensionMessageType, WebviewMessageType } from '../../shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '../../shared/settings';
import { summariseUnits } from '../../shared/state';
import { clearPostedMessages, postedMessages } from '../setup/webview';
import { documentDto, fileDto, nodeDto, unitDto } from '../support/dtoBuilders';

import type { ExtensionMessage } from '../../shared/messages';
import type { XliffDocument } from '../../webview/composables/useXliffDocument';

const DOCUMENT = documentDto([
    fileDto({
        original: 'App',
        tree: [nodeDto('Table 1', [], { name: 'Customer' })],
        units: [
            unitDto('Table 1', { source: 'Customer', target: 'Kunde' }),
            unitDto('Table 2', { source: 'Vendor', state: 'missing' }),
        ],
    }),
    fileDto({ index: 1, targetLanguage: 'fr-FR', units: [unitDto('Table 1', { source: 'Customer', target: 'Client' })] }),
]);

/**
 * Mounts the composable inside a throwaway component — `onMounted` means it can only run
 * in a real setup scope — and hands back what it returned.
 */
function host(render: (state: XliffDocument) => unknown) {
    let captured: XliffDocument | undefined;
    const wrapper = mount(defineComponent({
        setup() {
            captured = useXliffDocument();
            const state = captured;
            return () => render(state);
        },
    }));
    if (captured === undefined) {
        throw new Error('composable did not run');
    }
    return { state: captured, wrapper };
}

const useIt = (): XliffDocument => host(() => null).state;

const send = (message: ExtensionMessage): void => {
    window.dispatchEvent(new MessageEvent('message', { data: message }));
};

const sendDocument = (): void => {
    send({ type: ExtensionMessageType.setDocument, payload: DOCUMENT });
};

beforeEach(() => {
    clearPostedMessages();
});

afterEach(() => {
    clearPostedMessages();
});

describe('mounting', () => {
    it('posts exactly one ready', () => {
        useIt();
        expect(postedMessages).toEqual([{ type: WebviewMessageType.ready }]);
    });

    it('starts with nothing, and does not block on nothing', () => {
        const state = useIt();

        expect(state.document.value).toBeUndefined();
        expect(state.blocking.value).toBe(false);
        expect(state.settings.value).toEqual(DEFAULT_WEBVIEW_SETTINGS);
    });

    it('stops listening once unmounted', async () => {
        const { wrapper } = host(state => state.document.value?.fileName ?? '');

        wrapper.unmount();
        sendDocument();
        await nextTick();

        expect(wrapper.text()).toBe('');
    });
});

describe('applying messages', () => {
    it('holds the document it is sent', () => {
        const state = useIt();

        sendDocument();

        expect(state.document.value?.fileName).toBe('App.de-DE.xlf');
    });

    it('ignores anything that is not part of the contract', () => {
        const state = useIt();

        window.dispatchEvent(new MessageEvent('message', { data: { type: 'not-ours' } }));
        window.dispatchEvent(new MessageEvent('message', { data: 'garbage' }));

        expect(state.document.value).toBeUndefined();
    });

    it('tracks loading and clears it when the document lands', () => {
        const state = useIt();

        send({ type: ExtensionMessageType.loading, payload: { message: 'Parsing…' } });
        expect(state.loading.value).toBe('Parsing…');
        expect(state.blocking.value).toBe(true);

        sendDocument();
        expect(state.loading.value).toBeUndefined();
        expect(state.blocking.value).toBe(false);
    });

    it('keeps the document when a later parse fails, and stops blocking', () => {
        const state = useIt();

        sendDocument();
        send({ type: ExtensionMessageType.error, payload: { message: 'Unclosed tag', line: 4 } });

        expect(state.document.value).toBeDefined();
        expect(state.error.value?.message).toBe('Unclosed tag');
        expect(state.blocking.value).toBe(false);
    });

    it('blocks on a failure that has nothing behind it', () => {
        const state = useIt();

        send({ type: ExtensionMessageType.error, payload: { message: 'Unclosed tag' } });

        expect(state.blocking.value).toBe(true);
    });

    it('clears the error when a parse succeeds', () => {
        const state = useIt();

        send({ type: ExtensionMessageType.error, payload: { message: 'Unclosed tag' } });
        sendDocument();

        expect(state.error.value).toBeUndefined();
    });

    it('applies settings without touching the document', () => {
        const state = useIt();

        sendDocument();
        send({ type: ExtensionMessageType.settings, payload: { ...DEFAULT_WEBVIEW_SETTINGS, editMode: true } });

        expect(state.settings.value.editMode).toBe(true);
        expect(state.document.value?.fileName).toBe('App.de-DE.xlf');
    });

    it('does not know whether there is AL source until the host says', () => {
        const state = useIt();

        sendDocument();

        expect(state.alSourceAvailable.value).toBeUndefined();
    });

    it('keeps whether there is AL source across a re-parse, which does not say it again', () => {
        const state = useIt();

        sendDocument();
        send({ type: ExtensionMessageType.alSource, payload: { available: true } });
        sendDocument();

        expect(state.alSourceAvailable.value).toBe(true);
    });

    it('takes a later answer about AL source, which comes when files come or go', () => {
        const state = useIt();

        send({ type: ExtensionMessageType.alSource, payload: { available: true } });
        send({ type: ExtensionMessageType.alSource, payload: { available: false } });

        expect(state.alSourceAvailable.value).toBe(false);
    });
});

describe('the active file', () => {
    it('is the first one until something says otherwise', () => {
        const state = useIt();

        sendDocument();

        expect(state.activeFile.value?.targetLanguage).toBe('de-DE');
    });

    it('follows activeFileIndex', () => {
        const state = useIt();

        sendDocument();
        state.activeFileIndex.value = 1;

        expect(state.activeFile.value?.targetLanguage).toBe('fr-FR');
    });

    it('falls back to the first file rather than nothing when the index is out of range', () => {
        const state = useIt();

        sendDocument();
        state.activeFileIndex.value = 9;

        expect(state.activeFile.value?.targetLanguage).toBe('de-DE');
    });

    it('keeps the selected file across a re-parse of the same document', () => {
        // An edit re-sends the document; snapping back to the first <file> would undo the
        // switcher on every keystroke.
        const state = useIt();

        sendDocument();
        state.activeFileIndex.value = 1;
        sendDocument();

        expect(state.activeFileIndex.value).toBe(1);
    });

    it('goes back to the first file when a different document arrives', () => {
        const state = useIt();

        sendDocument();
        state.activeFileIndex.value = 1;
        send({ type: ExtensionMessageType.setDocument, payload: { ...DOCUMENT, uri: 'file:///w/Other.de-DE.xlf' } });

        expect(state.activeFileIndex.value).toBe(0);
    });

    it('falls back to the first file when the re-parse dropped the one on screen', () => {
        const state = useIt();

        sendDocument();
        state.activeFileIndex.value = 1;
        send({ type: ExtensionMessageType.setDocument, payload: { ...DOCUMENT, files: [DOCUMENT.files[0]] } });

        expect(state.activeFileIndex.value).toBe(0);
    });
});

describe('unitsById', () => {
    it('indexes the active file, which is what nodes are looked up through', () => {
        const state = useIt();

        sendDocument();

        expect(state.unitsById.value.size).toBe(2);
        expect(state.unitsById.value.get('Table 1')?.target).toBe('Kunde');
    });

    it('re-indexes when the active file changes, so two files cannot bleed into each other', () => {
        const state = useIt();

        sendDocument();
        state.activeFileIndex.value = 1;

        expect(state.unitsById.value.size).toBe(1);
        expect(state.unitsById.value.get('Table 1')?.target).toBe('Client');
    });

    it('is empty before a document arrives', () => {
        expect(useIt().unitsById.value.size).toBe(0);
    });
});

describe('openAsText', () => {
    it('asks the host for the raw file, with no unit — there may not be one', () => {
        const state = useIt();
        clearPostedMessages();

        state.openAsText();

        expect(postedMessages).toEqual([{ type: WebviewMessageType.openSource, target: 'text' }]);
    });
});

describe('patchUnits', () => {
    const patch = (fileIndex: number, units: unknown[]): void =>
        send({ type: ExtensionMessageType.patchUnits, payload: { fileIndex, units } } as ExtensionMessage);

    it('replaces only the units it names, leaving the rest identical', () => {
        const state = useIt();
        sendDocument();

        patch(0, [unitDto('Table 1', { source: 'Customer', target: 'Kunde', orphaned: true })]);

        expect(state.unitsById.value.get('Table 1')?.orphaned).toBe(true);
        expect(state.unitsById.value.get('Table 2')?.orphaned).toBeUndefined();
    });

    it('touches only the file it names', () => {
        const state = useIt();
        sendDocument();

        patch(1, [unitDto('Table 1', { source: 'Customer', target: 'Client', orphaned: true })]);

        expect(state.unitsById.value.get('Table 1')?.orphaned).toBeUndefined();
        state.activeFileIndex.value = 1;
        expect(state.unitsById.value.get('Table 1')?.orphaned).toBe(true);
    });

    it('moves the roll-up when an edit changes a state', () => {
        // The header percentage and every ancestor bar are computed from the units the
        // webview holds, so a patch that changes one has to be enough to move them.
        const state = useIt();
        sendDocument();
        const before = summariseUnits(state.activeFile.value?.units ?? []);

        patch(0, [unitDto('Table 2', { source: 'Vendor', target: 'NowTranslated' })]);

        const after = summariseUnits(state.activeFile.value?.units ?? []);
        expect(before.percent).toBe(50);
        expect(after.percent).toBe(100);
        expect(after.byState.translated).toBe(2);
    });

    it('ignores an empty patch, which is what an in-step file produces', () => {
        const state = useIt();
        sendDocument();
        const before = state.document.value;

        patch(0, []);

        expect(state.document.value).toBe(before);
    });

    it('ignores a patch that arrives before any document', () => {
        const state = useIt();

        patch(0, [unitDto('Table 1', { source: 'x' })]);

        expect(state.document.value).toBeUndefined();
    });
});

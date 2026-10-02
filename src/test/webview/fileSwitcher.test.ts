import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { DEV_DOCUMENT } from '../../webview/fixtures/devDocument';
import { stubLayout } from './layoutStub';
import { documentDto, fileDto, nodeDto, unitDto } from '../support/dtoBuilders';
import { XliffState } from '../../shared/state';
import { mountApp } from './support/mountApp';

/**
 * AL emits exactly one `<file>`, so a document with several has to be built by hand.
 *
 * The two files differ in every way the header shows: language, `original`, unit count
 * and state. An assertion that passed on identical files would prove nothing.
 */

const GERMAN = fileDto({
    original: 'Base App',
    tree: [nodeDto('Table 1', [nodeDto('Table 1 - Property 2')])],
    units: [unitDto('Table 1 - Property 2', { target: 'Kunde' })],
});

const FRENCH = fileDto({
    index: 1,
    targetLanguage: 'fr-FR',
    original: 'Extension App',
    tree: [nodeDto('Page 3', [nodeDto('Page 3 - Property 4'), nodeDto('Page 3 - Property 5')])],
    units: [
        unitDto('Page 3 - Property 4', { target: 'Client' }),
        unitDto('Page 3 - Property 5', { state: XliffState.empty, target: '' }),
    ],
});

const TWO_FILES = documentDto([GERMAN, FRENCH], { uri: 'file:///w/App.xlf', fileName: 'App.xlf' });

let restore: () => void;

beforeEach(() => {
    restore = stubLayout();
});

afterEach(() => {
    restore();
});

describe('a document with one <file>', () => {
    it('renders no switcher at all — which is every AL-generated file', async () => {
        const wrapper = mountApp({ ...TWO_FILES, files: [GERMAN] });
        await nextTick();

        expect(wrapper.find('.switcher').exists()).toBe(false);
        expect(wrapper.find('select').exists()).toBe(false);
    });

    it('renders no switcher for the dev fixture either', async () => {
        const wrapper = mountApp(DEV_DOCUMENT);
        await nextTick();

        expect(DEV_DOCUMENT.files).toHaveLength(1);
        expect(wrapper.find('select').exists()).toBe(false);
    });
});

describe('a document with several', () => {
    it('offers one option per file, named so they can be told apart', async () => {
        const wrapper = mountApp(TWO_FILES);
        await nextTick();

        const options = wrapper.findAll('option');

        expect(options.map(option => option.text())).toEqual([
            'Base App · en-US → de-DE',
            'Extension App · en-US → fr-FR',
        ]);
    });

    it('falls back to a position when a file declares no original', async () => {
        const wrapper = mountApp({
            ...TWO_FILES,
            files: [{ ...GERMAN, original: undefined }, { ...FRENCH, original: undefined }],
        });
        await nextTick();

        expect(wrapper.findAll('option').map(option => option.text())).toEqual([
            'File 1 · en-US → de-DE',
            'File 2 · en-US → fr-FR',
        ]);
    });

    it('starts on the first file', async () => {
        const wrapper = mountApp(TWO_FILES);
        await nextTick();

        expect(wrapper.get('.languages').text()).toBe('en-US → de-DE');
        expect((wrapper.get('select').element).value).toBe('0');
    });

    it('changes the header, the summary and the tree when switched', async () => {
        const wrapper = mountApp(TWO_FILES);
        await nextTick();
        expect(wrapper.get('.app-name').text()).toBe('Base App');
        expect(wrapper.get('.percent').text()).toBe('100 %');
        expect(wrapper.findAll('.tree-row')).toHaveLength(2);

        await wrapper.get('select').setValue('1');
        await nextTick();

        expect(wrapper.get('.app-name').text()).toBe('Extension App');
        expect(wrapper.get('.languages').text()).toBe('en-US → fr-FR');
        expect(wrapper.get('.percent').text()).toBe('50 %');
        expect(wrapper.text()).toContain('2 units');
        expect(wrapper.findAll('.tree-row')).toHaveLength(3);
        expect(wrapper.text()).toContain('Page 3 - Property 4');
    });

    it('shows no row from the file it left behind', async () => {
        const wrapper = mountApp(TWO_FILES);
        await nextTick();

        await wrapper.get('select').setValue('1');
        await nextTick();

        expect(wrapper.text()).not.toContain('Table 1 - Property 2');
    });

    it('is a labelled control, reachable by Tab and operable by keyboard', async () => {
        const wrapper = mountApp(TWO_FILES);
        await nextTick();

        const label = wrapper.get('.switcher');
        expect(label.element.tagName).toBe('LABEL');
        expect(label.text()).toContain('File');
        // A native select is focusable and keyboard-operable without any handler of ours.
        expect(wrapper.get('select').attributes('tabindex')).toBeUndefined();
        expect(wrapper.get('select').element.disabled).toBe(false);
    });

    it('gives the first file back its expansion when switched back', async () => {
        const wrapper = mountApp(TWO_FILES);
        await nextTick();

        // Collapse the German file's only root, then leave and come back.
        await wrapper.get('.chevron').trigger('click');
        expect(wrapper.findAll('.tree-row')).toHaveLength(1);

        await wrapper.get('select').setValue('1');
        await nextTick();
        await wrapper.get('select').setValue('0');
        await nextTick();

        expect(wrapper.findAll('.tree-row')).toHaveLength(1);
    });
});

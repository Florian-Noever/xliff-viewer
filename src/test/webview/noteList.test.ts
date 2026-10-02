import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import NoteList from '../../webview/components/NoteList.vue';

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

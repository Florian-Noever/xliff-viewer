import { describe, expect, it } from 'vitest';

import { sourceAction } from '../../webview/sourceAction';

import type { SourceAction, SourceContext } from '../../webview/sourceAction';

/** Every combination of what the host can have said, and of the unit's own markers. */
function everyContext(): SourceContext[] {
    const contexts: SourceContext[] = [];
    for (const alSource of [undefined, true, false]) {
        for (const baseFile of [undefined, null, 'App.g.xlf']) {
            for (const isBaseFile of [false, true]) {
                for (const orphaned of [false, true]) {
                    contexts.push({ alSource, baseFile, isBaseFile, orphaned });
                }
            }
        }
    }
    return contexts;
}

describe('sourceAction', () => {
    it('is enabled exactly when the AL source or a fallback can answer', () => {
        for (const context of everyContext()) {
            const fallback = context.isBaseFile || (typeof context.baseFile === 'string' && !context.orphaned);
            const expected = context.alSource === true || fallback;

            expect(sourceAction(context).enabled, JSON.stringify(context)).toBe(expected);
        }
    });

    it('says why whenever it is disabled, and never offers what it cannot do', () => {
        for (const context of everyContext()) {
            const { enabled, title } = sourceAction(context);

            expect(title, JSON.stringify(context)).not.toBe('');
            if (!enabled) {
                expect(title.startsWith('Open') || title.includes('shows the unit'), JSON.stringify(context)).toBe(false);
            }
            if (context.alSource === false) {
                expect(title.startsWith('Open'), JSON.stringify(context)).toBe(false);
            }
        }
    });

    const ANSWERED_NOTHING: SourceContext = { alSource: undefined, baseFile: undefined, isBaseFile: false, orphaned: false };

    it.each<[string, Partial<SourceContext>, SourceAction]>([
        ['while the host has answered nothing', {}, { enabled: false, title: 'Looking for the AL source…' }],
        ['while it looks, with a base file behind it', { baseFile: 'App.g.xlf' }, { enabled: true, title: 'Open the AL source that declares this unit, or show the unit in App.g.xlf if none does.' }],
        ['with AL source and a base file behind it', { alSource: true, baseFile: 'App.g.xlf' }, { enabled: true, title: 'Open the AL source that declares this unit, or show the unit in App.g.xlf if none does.' }],
        ['with a base file and no AL source', { alSource: false, baseFile: 'App.g.xlf' }, { enabled: true, title: 'No AL source was found for this app, so this shows the unit in App.g.xlf.' }],
        ['with no AL source while the base file is still sought', { alSource: false }, { enabled: false, title: 'No AL source was found for this app. Looking for the base file…' }],
        ['with neither', { alSource: false, baseFile: null }, { enabled: false, title: 'No AL source and no base file were found for this translation file.' }],
        ['for a unit the base file dropped, with no AL source', { alSource: false, baseFile: 'App.g.xlf', orphaned: true }, { enabled: false, title: 'No AL source was found for this app, and App.g.xlf does not contain this unit any more.' }],
        ['for a unit the base file dropped, with AL source', { alSource: true, baseFile: 'App.g.xlf', orphaned: true }, { enabled: true, title: 'Open the AL source that declares this unit.' }],
        ['in a base file with AL source', { alSource: true, baseFile: null, isBaseFile: true }, { enabled: true, title: 'Open the AL source that declares this unit, or show the unit in this file if none does.' }],
        ['in a base file without AL source', { alSource: false, baseFile: null, isBaseFile: true }, { enabled: true, title: 'No AL source was found for this app, so this shows the unit in this file.' }],
    ])('says what it will do %s', (_situation, context, expected) => {
        expect(sourceAction({ ...ANSWERED_NOTHING, ...context })).toEqual(expected);
    });

    it('names the base file only while it still carries the unit', () => {
        const carried = sourceAction({ alSource: true, baseFile: 'App.g.xlf', isBaseFile: false, orphaned: false });
        const dropped = sourceAction({ alSource: true, baseFile: 'App.g.xlf', isBaseFile: false, orphaned: true });

        expect(carried.title).toContain('App.g.xlf');
        expect(dropped.title).not.toContain('App.g.xlf');
    });
});

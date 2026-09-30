import { describe, expect, it } from 'vitest';

import { sourceAction } from '../../webview/sourceAction';

import type { SourceContext } from '../../webview/sourceAction';

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

    it('names the base file only while it still carries the unit', () => {
        const carried = sourceAction({ alSource: true, baseFile: 'App.g.xlf', isBaseFile: false, orphaned: false });
        const dropped = sourceAction({ alSource: true, baseFile: 'App.g.xlf', isBaseFile: false, orphaned: true });

        expect(carried.title).toContain('App.g.xlf');
        expect(dropped.title).not.toContain('App.g.xlf');
    });
});

/**
 * What "Go to source" will do for one unit, as far as the webview can know before asking.
 *
 * The host decides at click time: the AL declaration when the source has one, else the unit
 * in the base file — or, in a base file, in the file itself. So the button is on whenever
 * one of those can work, and its title says which. It is off only when neither can, and
 * then the title says why: not yet, there is none, or the base file dropped this unit.
 */

export interface SourceContext {
    /** Whether the app has AL source; undefined until the host has looked. */
    readonly alSource: boolean | undefined;
    /** The base file's name; undefined until resolution has run, null when it found none. */
    readonly baseFile: string | null | undefined;
    /** The document is itself a base file, so the fallback is the file itself. */
    readonly isBaseFile: boolean;
    /** The base file no longer carries this unit. */
    readonly orphaned: boolean;
}

export interface SourceAction {
    readonly enabled: boolean;
    readonly title: string;
}

export function sourceAction(context: SourceContext): SourceAction {
    const fallback = fallbackOf(context);

    // Not knowing yet is as good as knowing there is AL source: the host looks either way.
    if (context.alSource === true || (context.alSource === undefined && fallback !== undefined)) {
        return {
            enabled: true,
            title: fallback === undefined
                ? 'Open the AL source that declares this unit.'
                : `Open the AL source that declares this unit, or show the unit in ${fallback} if none does.`,
        };
    }
    if (context.alSource === undefined) {
        return { enabled: false, title: 'Looking for the AL source…' };
    }

    if (fallback !== undefined) {
        return { enabled: true, title: `No AL source was found for this app, so this shows the unit in ${fallback}.` };
    }
    if (context.baseFile === undefined) {
        return { enabled: false, title: 'No AL source was found for this app. Looking for the base file…' };
    }
    if (context.baseFile === null) {
        return { enabled: false, title: 'No AL source and no base file were found for this translation file.' };
    }
    return { enabled: false, title: `No AL source was found for this app, and ${context.baseFile} does not contain this unit any more.` };
}

/** Where the unit can be shown when no AL source declares it, if anywhere. */
function fallbackOf(context: SourceContext): string | undefined {
    if (context.isBaseFile) {
        return 'this file';
    }
    return typeof context.baseFile === 'string' && !context.orphaned ? context.baseFile : undefined;
}

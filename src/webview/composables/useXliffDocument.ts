import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';

import { DEV_DOCUMENT } from '../fixtures/devDocument';
import { isVscode, postMessage } from '../vscode';

import { ExtensionMessageType, isExtensionMessage, NavigationTarget, WebviewMessageType } from '@shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '@shared/settings';

import type { TransUnitDto, XliffDocumentDto, XliffFileDto } from '@shared/dto';
import type { ErrorPayload, NavigationTarget as NavigationTargetValue } from '@shared/messages';
import type { WebviewSettings } from '@shared/settings';
import type { ComputedRef, Ref } from 'vue';

/**
 * The document the webview is showing, and everything derived from it (MASTER_PLAN §11.3).
 *
 * All of the message handling lives here rather than in `App.vue`: components render, they
 * do not decide. It is also the one place that knows the host's message order, which is
 * load-bearing — see `document` below.
 *
 * **Nothing here survives being unmounted, and nothing needs to** (`DEC-029`). The webview
 * re-posts `ready` on every mount and the host answers from its parse cache, so remounting
 * costs one message. View state that must outlive a hidden tab is `POLISH-02`'s, through
 * `vscode.setState`.
 */

export interface XliffDocument {
    /** Undefined until the first `setDocument`, and never cleared by a later failure. */
    readonly document: Ref<XliffDocumentDto | undefined>;
    /** The message shown while the host is parsing; undefined when it is not. */
    readonly loading: Ref<string | undefined>;
    /** The most recent failure, cleared by the next successful parse. */
    readonly error: Ref<ErrorPayload | undefined>;
    readonly settings: Ref<WebviewSettings>;
    /** Which `<file>` is on screen (`DEC-020`). `UI-03a` gives it a switcher. */
    readonly activeFileIndex: Ref<number>;
    readonly activeFile: ComputedRef<XliffFileDto | undefined>;
    /** The active file's units by id. The DTO ships an array and its nodes carry no unit id (`DEC-028`). */
    readonly unitsById: ComputedRef<ReadonlyMap<string, TransUnitDto>>;
    /** True when a failure has nothing behind it, so the error must take the whole view (§7.7). */
    readonly blocking: ComputedRef<boolean>;
    readonly unitCount: ComputedRef<number>;
    /** Opens the raw XML in the built-in editor — the one action available while nothing parses. */
    openAsText(): void;
    /** Navigation for one unit (§10). The host decides what each target means. */
    openSource(target: NavigationTargetValue, unitId: string): void;
}

/**
 * Replaces the named units in one `<file>`, leaving everything else identical.
 *
 * The host sends only the units that changed (§9.3), so this is a merge rather than a
 * replacement — and a new object each time, because the document is a `shallowRef`.
 */
function patchUnits(
    current: XliffDocumentDto | undefined,
    fileIndex: number,
    patched: readonly TransUnitDto[],
): XliffDocumentDto | undefined {
    if (current === undefined || patched.length === 0) {
        return current;
    }

    const byId = new Map(patched.map(unit => [unit.id, unit]));
    return {
        ...current,
        files: current.files.map(file => (file.index === fileIndex
            ? { ...file, units: file.units.map(unit => byId.get(unit.id) ?? unit) }
            : file)),
    };
}

export function useXliffDocument(): XliffDocument {
    // shallowRef: the DTO is a large frozen-in-practice tree that is replaced wholesale,
    // never mutated. Deep reactivity over 2500 units would cost on every assignment.
    const document = shallowRef<XliffDocumentDto | undefined>(undefined);
    const loading = ref<string | undefined>(undefined);
    const error = ref<ErrorPayload | undefined>(undefined);
    const settings = ref<WebviewSettings>(DEFAULT_WEBVIEW_SETTINGS);
    const activeFileIndex = ref(0);

    const activeFile = computed(() => document.value?.files[activeFileIndex.value] ?? document.value?.files[0]);
    const unitsById = computed(() => new Map((activeFile.value?.units ?? []).map(unit => [unit.id, unit])));
    const unitCount = computed(() => document.value?.files.reduce((total, file) => total + file.units.length, 0) ?? 0);
    const blocking = computed(() => document.value === undefined && (loading.value !== undefined || error.value !== undefined));

    function apply(message: unknown): void {
        if (!isExtensionMessage(message)) {
            return;
        }
        switch (message.type) {
            case ExtensionMessageType.loading:
                loading.value = message.payload.message;
                error.value = undefined;
                break;
            case ExtensionMessageType.setDocument:
                // The host posts the last good document *ahead* of an error, so clearing
                // the error here is safe and a later `error` still lands (§7.7).
                document.value = message.payload;
                activeFileIndex.value = 0;
                loading.value = undefined;
                error.value = undefined;
                break;
            case ExtensionMessageType.error:
                error.value = message.payload;
                loading.value = undefined;
                break;
            case ExtensionMessageType.patchUnits:
                document.value = patchUnits(document.value, message.payload.fileIndex, message.payload.units);
                break;
            case ExtensionMessageType.baseFile:
                // Arrives after the document (§9.2). `null` means resolution ran and found
                // nothing, which the header says out loud; leaving it undefined would not.
                if (document.value !== undefined) {
                    document.value = { ...document.value, baseFile: message.payload };
                }
                break;
            case ExtensionMessageType.settings:
                settings.value = message.payload;
                break;
            default:
                break;
        }
    }

    const onMessage = (event: MessageEvent): void => {
        apply(event.data);
    };

    function openAsText(): void {
        postMessage({ type: WebviewMessageType.openSource, target: NavigationTarget.text });
    }

    function openSource(target: NavigationTargetValue, unitId: string): void {
        postMessage({
            type: WebviewMessageType.openSource,
            target,
            fileIndex: activeFile.value?.index ?? 0,
            unitId,
        });
    }

    onMounted(() => {
        window.addEventListener('message', onMessage);
        postMessage({ type: WebviewMessageType.ready });

        // No host to answer `ready`: the Vite dev server renders a real corpus projection
        // so the UI can be built in a browser (§14.4).
        if (import.meta.env.DEV && !isVscode) {
            document.value = DEV_DOCUMENT;
        }
    });

    onUnmounted(() => {
        window.removeEventListener('message', onMessage);
    });

    return {
        document,
        loading,
        error,
        settings,
        activeFileIndex,
        activeFile,
        unitsById,
        blocking,
        unitCount,
        openAsText,
        openSource,
    };
}

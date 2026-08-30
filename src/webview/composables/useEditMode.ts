import { computed, ref, watch } from 'vue';

import type { XliffDocumentDto } from '@shared/dto';
import type { WebviewSettings } from '@shared/settings';
import type { ComputedRef, Ref } from 'vue';

/**
 * Whether the user is editing, and when not, why not (MASTER_PLAN §11.3, §12.5, §13).
 *
 * **Read-only is the default and editing is opt-in.** Two separate questions live here and
 * are deliberately not collapsed into one boolean: whether the document *can* be edited,
 * which the host decides, and whether the user has asked to, which the toggle decides. A
 * single flag would leave the GUI unable to say which of the two is stopping it — and §12.5
 * asks for the reason, not just the refusal.
 */

export const EditRefusal = {
    /** A `.g.xlf`: the AL compiler owns it (`DEC-011`). */
    baseFile: 'baseFile',
    /** The file, or the file system under it, will not take a write. */
    readOnly: 'readOnly',
    /** Nothing is wrong; the toggle is simply off. */
    off: 'off',
} as const;
export type EditRefusal = typeof EditRefusal[keyof typeof EditRefusal];

const REASONS: Readonly<Record<EditRefusal, string>> = {
    [EditRefusal.baseFile]: 'This is the base file, which the AL compiler owns. Edit the language file instead.',
    [EditRefusal.readOnly]: 'This file is read-only.',
    [EditRefusal.off]: 'Editing is off. Turn it on to change targets and states.',
};

export interface EditMode {
    /** Whether the toggle is on. Meaningless on a document that cannot be edited. */
    readonly wanted: Ref<boolean>;
    /** Whether the document allows editing at all — what decides if the toggle is offered. */
    readonly available: ComputedRef<boolean>;
    /** Editing is on **and** possible. This is what the UI swaps text for inputs on. */
    readonly active: ComputedRef<boolean>;
    /** Why editing is not happening, or undefined when it is. */
    readonly refusal: ComputedRef<EditRefusal | undefined>;
    /** The same, in a sentence (§12.5). */
    readonly reason: ComputedRef<string | undefined>;
    toggle(): void;
}

export interface EditModeSource {
    readonly document: Ref<XliffDocumentDto | undefined>;
    readonly settings: Ref<WebviewSettings>;
}

export function useEditMode(source: EditModeSource): EditMode {
    const wanted = ref(false);

    // §13: the setting seeds the toggle rather than owning it. Watching the value means a
    // change in settings re-seeds, while the user's own toggle survives everything else the
    // host posts — settings arrive again on every configuration change.
    watch(() => source.settings.value.editMode, (setting) => {
        wanted.value = setting;
    }, { immediate: true });

    const available = computed(() => source.document.value !== undefined && !source.document.value.readOnly);
    const active = computed(() => available.value && wanted.value);

    const refusal = computed<EditRefusal | undefined>(() => {
        const document = source.document.value;
        if (document === undefined) {
            return EditRefusal.off;
        }
        if (document.isBaseFile) {
            return EditRefusal.baseFile;
        }
        if (document.readOnly) {
            return EditRefusal.readOnly;
        }
        return wanted.value ? undefined : EditRefusal.off;
    });

    const reason = computed(() => (refusal.value === undefined ? undefined : REASONS[refusal.value]));

    function toggle(): void {
        if (available.value) {
            wanted.value = !wanted.value;
        }
    }

    return { wanted, available, active, refusal, reason, toggle };
}

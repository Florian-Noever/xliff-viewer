<template>
    <div class="unit-card" :class="{ muted: !unit.translate }">
        <div class="text">
            <p class="source">{{ unit.source === '' ? '' : unit.source }}<span v-if="unit.source === ''" class="absent">(empty source)</span></p>
            <p class="target">
                <span v-if="unit.target === undefined" class="absent">no target</span>
                <span v-else-if="unit.target === ''" class="absent">empty target</span>
                <template v-else-if="whitespace !== undefined">
                    <span class="ws" :title="explanation">{{ visible.lead }}</span><span>{{ visible.core }}</span><span class="ws" :title="explanation">{{ visible.trail }}</span>
                </template>
                <span v-else>{{ unit.target }}</span>
            </p>
            <p v-if="whitespace !== undefined" class="whitespace-note">{{ explanation }}</p>
        </div>

        <p v-if="hint !== undefined" class="hint">
            <span class="hint-label">suggested</span>
            <span>{{ hint }}</span>
        </p>

        <MetaChips :unit="unit" />

        <NoteList
            :notes="unit.notes"
            :show-developer-notes="settings.showDeveloperNotes"
            :generator-note="generatorNote"
        />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import MetaChips from './MetaChips.vue';
import NoteList from './NoteList.vue';
import { DEVELOPER_NOTE } from '../constants';
import { loadBearingWhitespace, whitespaceExplanation, whitespaceParts, WhitespaceReason } from '../whitespace';

import type { TransUnitDto } from '@shared/dto';
import type { WebviewSettings } from '@shared/settings';

/**
 * One trans-unit, read-only (MASTER_PLAN §11.3, §2.1).
 *
 * Text renders as text, never as a disabled input: a disabled field says "you could edit
 * this but may not", which is the wrong message in a viewer.
 */

const SPACE_MARK = '␣';

const props = defineProps<{
    unit: TransUnitDto;
    settings: WebviewSettings;
    /** Reconstructed by the caller when `showGeneratorNotes` is on (§4.4). */
    generatorNote?: string;
}>();

const whitespace = computed(() => loadBearingWhitespace(props.unit.source, props.unit.target));
const explanation = computed(() => (whitespace.value === undefined ? undefined : whitespaceExplanation(whitespace.value)));

/** Renders the load-bearing spaces as something the eye can see, and only those. */
const visible = computed(() => {
    const target = props.unit.target ?? '';
    if (whitespace.value === WhitespaceReason.only) {
        return { lead: target.replace(/\s/g, SPACE_MARK), core: '', trail: '' };
    }
    const parts = whitespaceParts(target);
    return {
        lead: parts.lead.replace(/\s/g, SPACE_MARK),
        core: parts.core,
        trail: parts.trail.replace(/\s/g, SPACE_MARK),
    };
});

/**
 * The `Developer` note with its `xx-XX=` prefix stripped (§3.7).
 *
 * Shown only where it tells the reader something new: not when the note had no prefix to
 * strip, and not when the translator has already used the suggestion — which is most of
 * the corpus, and would otherwise print the target twice under every unit.
 */
const hint = computed(() => {
    const suggestion = props.unit.developerHint;
    if (!props.settings.showDeveloperNotes || suggestion === undefined || suggestion === props.unit.target) {
        return undefined;
    }
    const raw = props.unit.notes.find(note => note.from === DEVELOPER_NOTE)?.value;
    return raw === suggestion ? undefined : suggestion;
});
</script>

<style scoped>
.unit-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding-block: 2px;
}

.unit-card.muted {
    color: var(--vscode-descriptionForeground);
}

.text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.source,
.target,
.hint,
.whitespace-note {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.source {
    color: var(--vscode-descriptionForeground);
}

.absent {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
}

.ws {
    border-radius: 2px;
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-editorWarning-foreground);
}

.whitespace-note {
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
}

.hint {
    display: flex;
    gap: 6px;
    font-size: calc(var(--font) * 0.9);
}

.hint-label {
    flex: none;
    color: var(--vscode-descriptionForeground);
}
</style>

<template>
    <ul v-if="notes.length > 0 || generatorNote !== undefined" class="note-list">
        <li v-for="(note, index) in notes" :key="index" class="note">
            <span class="from">{{ note.from ?? 'note' }}</span>
            <span v-if="note.value === ''" class="empty">(empty)</span>
            <span v-else class="value">{{ note.value }}</span>
        </li>
        <li v-if="generatorNote !== undefined" class="note">
            <span class="from">Xliff Generator</span>
            <span class="value">{{ generatorNote }}</span>
        </li>
    </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { DEVELOPER_NOTE } from '../constants';

import type { XliffNoteDto } from '@shared/dto';

/**
 * Every note the unit carries, verbatim (§3.7).
 *
 * Unknown `from` values are shown rather than dropped — other tools write notes, and §2.1
 * says nothing is lost. An empty `Developer` note is shown as empty rather than omitted:
 * 347 corpus units have one, and its absence and its emptiness are different facts.
 *
 * The `Xliff Generator` note is not in the payload at all; the caller reconstructs it from
 * the tree when `showGeneratorNotes` is on.
 */

const props = defineProps<{
    notes: readonly XliffNoteDto[];
    showDeveloperNotes: boolean;
    /** Already reconstructed by the caller, or undefined when the setting is off or it could not be. */
    generatorNote?: string;
}>();

const notes = computed(() => (props.showDeveloperNotes
    ? props.notes
    : props.notes.filter(note => note.from !== DEVELOPER_NOTE)));
</script>

<style scoped>
.note-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.note {
    display: flex;
    gap: 6px;
    font-size: calc(var(--font) * 0.9);
}

.from {
    flex: none;
    color: var(--vscode-descriptionForeground);
}

.value {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.empty {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
}
</style>

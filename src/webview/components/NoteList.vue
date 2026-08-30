<template>
    <dl v-if="notes.length > 0 || generatorNote !== undefined" class="note-list">
        <template v-for="(note, index) in notes" :key="index">
            <dt class="from">{{ note.from ?? 'note' }}</dt>
            <dd v-if="note.value === ''" class="empty">(empty)</dd>
            <dd v-else class="value">{{ note.value }}</dd>
        </template>
        <template v-if="generatorNote !== undefined">
            <dt class="from">Xliff Generator</dt>
            <dd class="value">{{ generatorNote }}</dd>
        </template>
    </dl>
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
 *
 * A description list on the unit card's own label column (`DEC-034`), so a note lines up
 * with the strings it is about. The column is a fixed token rather than content-derived,
 * which is what lets three separate grids agree without one wrapping the others.
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
    display: grid;
    grid-template-columns: minmax(0, var(--label-column)) minmax(0, 1fr);
    gap: 1px var(--gap);
    margin: 0;
    font-size: calc(var(--font) * 0.9);
}

.from {
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.value,
.empty {
    margin: 0;
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.empty {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
}
</style>

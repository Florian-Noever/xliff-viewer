<!-- eslint-disable vue/multi-word-component-names -- the rule guards against clashing with an HTML element, and there is no toolbar element. -->
<template>
    <div class="toolbar">
        <label class="search">
            <span class="sr-only">Search translation units</span>
            <input
                ref="input"
                v-model="query"
                type="search"
                class="search-input"
                placeholder="Search source, target, names and notes…"
                :aria-describedby="matchCount === undefined ? undefined : 'filter-count'"
                @keydown.esc.prevent="clear()"
            >
        </label>

        <div class="chips" role="group" aria-label="Filter by translation state">
            <button
                v-for="chip in filter.chips.value"
                :key="chip.state"
                type="button"
                class="chip"
                :class="[`tone-${stateTone(chip.state)}`, { on: chip.selected }]"
                :aria-pressed="chip.selected"
                @click="filter.toggle(chip.state)"
            >
                <span class="dot" aria-hidden="true" />
                {{ stateLabel(chip.state) }}
                <span class="chip-count">{{ chip.count }}</span>
            </button>
        </div>

        <span v-if="matchCount !== undefined" id="filter-count" class="match-count" role="status">
            {{ matchCount === 0 ? 'no matches' : `${matchCount} matching` }}
        </span>

        <div class="actions">
            <button type="button" class="action" @click="emit('expandAll')">Expand all</button>
            <button type="button" class="action" @click="emit('collapseAll')">Collapse all</button>
            <button
                type="button"
                class="action edit-toggle"
                :class="{ on: edit.active.value }"
                :disabled="!edit.available.value"
                :aria-pressed="edit.active.value"
                :title="edit.reason.value ?? 'Editing is on. Targets and states can be changed.'"
                @click="edit.toggle()"
            >
                {{ edit.active.value ? 'Editing' : 'Edit' }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';

import { stateLabel, stateTone } from '../stateTone';

import type { EditMode } from '../composables/useEditMode';
import type { Search } from '../composables/useSearch';
import type { StateFilter } from '../composables/useStateFilter';

/**
 * Search, the state chips, and expand/collapse.
 *
 * The edit toggle carries its own refusal: disabled when the document cannot be edited at
 * all, and its tooltip says which reason applies rather than leaving the reader to guess
 * why nothing happens.
 */

const props = defineProps<{
    search: Search;
    filter: StateFilter;
    edit: EditMode;
    /** How many units satisfy every active filter. Undefined when nothing is filtering. */
    matchCount?: number;
}>();

const emit = defineEmits<{ expandAll: []; collapseAll: [] }>();

const { query, clear } = props.search;
const input = useTemplateRef<HTMLInputElement>('input');

/** Ctrl+F focuses search, Escape clears it. Escape is on the input; this is the reach for it. */
function onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        input.value?.focus();
        input.value?.select();
    }
}

onMounted(() => {
    window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.toolbar {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gap);
    padding: var(--pad) calc(var(--pad) * 2);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.search {
    flex: 1;
    min-width: 180px;
    max-width: 360px;
    display: flex;
}

.search-input {
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
}

.search-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 7px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius-sm);
    background: none;
    color: inherit;
    font: inherit;
    font-size: calc(var(--font) * 0.85);
    cursor: pointer;
}

.chip:hover {
    background: var(--vscode-list-hoverBackground);
}

.chip.on {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground);
}

/* Both signals for "on" are colours, and a forced-colours theme takes both. */
@media (forced-colors: active) {
    .chip.on {
        background: Highlight;
        color: HighlightText;
    }
}

.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
}

.chip-count {
    color: var(--vscode-descriptionForeground);
    font-variant-numeric: tabular-nums;
}

.tone-done {
    color: var(--vscode-testing-iconPassed, var(--vscode-charts-green));
}

.tone-pending {
    color: var(--vscode-editorWarning-foreground, var(--vscode-charts-yellow));
}

.tone-absent {
    color: var(--vscode-errorForeground, var(--vscode-inputValidation-errorBorder));
}

.tone-muted {
    color: var(--vscode-descriptionForeground);
}

.match-count {
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.9);
    white-space: nowrap;
}

.actions {
    margin-inline-start: auto;
    display: flex;
    gap: 4px;
}

.action {
    padding: 2px 8px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: var(--radius-sm);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    font: inherit;
    font-size: calc(var(--font) * 0.9);
    cursor: pointer;
}

.action:hover {
    background: var(--vscode-button-secondaryHoverBackground);
}
</style>

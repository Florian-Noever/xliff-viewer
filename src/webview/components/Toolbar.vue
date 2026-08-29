<!-- eslint-disable vue/multi-word-component-names -- MASTER_PLAN §11.3 names this component Toolbar; the rule guards against clashing with an HTML element, and there is none. -->
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
                :aria-describedby="active ? 'search-count' : undefined"
                @keydown.esc.prevent="clear()"
            >
        </label>
        <span v-if="active" id="search-count" class="match-count" role="status">
            {{ matchCount === 0 ? 'no matches' : `${matchCount} matching` }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';

import type { Search } from '../composables/useSearch';

/**
 * Search, and the shelf the rest of the controls land on (MASTER_PLAN §11.2).
 *
 * `FIND-02` adds the state chips and expand/collapse here; `EDIT-04` the edit toggle.
 */

const props = defineProps<{ search: Search }>();

const { query, active, matchCount, clear } = props.search;
const input = useTemplateRef<HTMLInputElement>('input');

/** Ctrl+F focuses search, Escape clears it (§11.7). Escape is on the input; this is the reach for it. */
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
    align-items: center;
    gap: var(--gap);
    padding: var(--pad) calc(var(--pad) * 2);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.search {
    flex: 1;
    min-width: 0;
    max-width: 420px;
    display: flex;
}

.search-input {
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--vscode-input-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
}

.search-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
}

.match-count {
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.9);
    white-space: nowrap;
}
</style>

<template>
    <div
        class="tree-row"
        :class="{ 'is-focused': focused, 'is-unit': row.unit !== undefined }"
        role="treeitem"
        :aria-level="row.depth + 1"
        :aria-posinset="row.position"
        :aria-setsize="row.siblings"
        :aria-expanded="row.hasChildren ? row.expanded : undefined"
        :aria-selected="focused"
        :tabindex="focused ? 0 : -1"
        :style="{ paddingInlineStart: `calc(var(--row-indent) * ${row.depth})` }"
        @click="emit('focus', row.key)"
    >
        <button
            v-if="row.hasChildren"
            type="button"
            class="chevron"
            tabindex="-1"
            :aria-label="`${row.expanded ? 'Collapse' : 'Expand'} ${label}`"
            @click.stop="emit('toggle', row.key)"
        >
            <!-- eslint-disable-next-line vue/no-v-html -- a build-time constant from @vscode/codicons, never user input -->
            <span class="glyph" v-html="row.expanded ? Icon.chevronDown : Icon.chevronRight" />
        </button>
        <span v-else class="chevron-spacer" aria-hidden="true" />

        <span class="type">{{ row.type }}</span>
        <span class="name">{{ label }}</span>
        <UnitCard
            v-if="row.unit !== undefined && settings !== undefined"
            class="card"
            :unit="row.unit"
            :settings="settings"
            :generator-note="generatorNote"
        />
        <span class="spacer" />
        <StateBadge
            v-if="row.unit !== undefined"
            :state="row.unit.state"
            :muted="!row.unit.translate"
        />
        <ProgressBar v-else-if="summary !== undefined" :summary="summary" />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import ProgressBar from './ProgressBar.vue';
import StateBadge from './StateBadge.vue';
import UnitCard from './UnitCard.vue';
import { Icon } from '../icons';

import type { TreeRow } from '../composables/useTreeFlatten';
import type { StateSummary } from '@shared/state';
import type { WebviewSettings } from '@shared/settings';

const props = defineProps<{
    row: TreeRow;
    focused: boolean;
    /** The roll-up for this node. Absent on a unit row, which shows its own state instead. */
    summary?: StateSummary;
    settings?: WebviewSettings;
    /** Rebuilt from the tree by the caller, since the payload does not carry it (§4.4). */
    generatorNote?: string;
}>();

const emit = defineEmits<{
    toggle: [key: string];
    focus: [key: string];
}>();

/**
 * The generator note could not be parsed for this node, so there is no name (§4.4).
 * Showing the hash is better than showing nothing: it is what the id says, and it is what
 * a search of the raw file will match.
 */
const label = computed(() => props.row.name ?? props.row.key.split(' - ').pop() ?? props.row.key);
</script>

<style scoped>
.tree-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-height: var(--row-height);
    padding-block: 2px;
    padding-inline-end: var(--pad);
    cursor: default;
    white-space: nowrap;
}

/* Everything on a container row sits on one line; a unit's card is the exception. */
.tree-row > :not(.card) {
    margin-block: calc((var(--row-height) - 1.4em) / 2);
}

.card {
    flex: 1;
    min-width: 0;
    white-space: normal;
    margin-block: 0;
}

.tree-row:hover {
    background: var(--vscode-list-hoverBackground);
}

.tree-row.is-focused {
    background: var(--vscode-list-activeSelectionBackground);
}

.tree-row:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
}

.chevron,
.chevron-spacer {
    flex: none;
    width: 16px;
    height: 16px;
}

.chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: none;
    color: var(--vscode-foreground);
    cursor: pointer;
}

.glyph {
    display: inline-flex;
    width: 16px;
    height: 16px;
}

.type {
    flex: none;
    padding: 0 5px;
    border-radius: var(--radius-sm);
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
}

.name {
    flex: none;
    overflow: hidden;
    text-overflow: ellipsis;
}

.spacer {
    flex: 1;
    min-width: var(--gap);
}
</style>

<template>
    <span class="state-badge" :class="`tone-${tone}`" :title="title">
        <span class="dot" aria-hidden="true" />
        <span class="label">{{ label }}</span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { stateLabel, StateTone, stateTone } from '../stateTone';

import type { XliffState } from '@shared/state';

/**
 * One unit's translation state.
 *
 * The dot carries the colour and the text carries the meaning, so the badge still reads
 * correctly in a high-contrast theme and for anyone who cannot separate the four tones.
 */

const props = defineProps<{
    state: XliffState;
    /** `translate="no"`: not part of any roll-up, and shown muted rather than coloured. */
    muted?: boolean;
}>();

const tone = computed(() => (props.muted === true ? StateTone.muted : stateTone(props.state)));
const label = computed(() => (props.muted === true ? 'not translatable' : stateLabel(props.state)));
const title = computed(() => (props.muted === true ? `translate="no" — ${stateLabel(props.state)}` : undefined));
</script>

<style scoped>
/* No background: the toolbar's state chips read the same way, and a row that is already
   highlighted on hover does not need a second filled surface on top of it. */
.state-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    font-size: calc(var(--font) * 0.85);
    white-space: nowrap;
}

.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
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

.tone-muted .dot {
    background: none;
    border: 1px solid currentColor;
}
</style>

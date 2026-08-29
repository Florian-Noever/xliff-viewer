<template>
    <span v-if="summary.worst !== undefined" class="progress" :title="title">
        <span
            class="track"
            role="progressbar"
            :aria-valuenow="summary.percent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`${summary.translatedCount} of ${summary.translatable} translated`"
        >
            <span class="fill" :class="`tone-${tone}`" :style="{ inlineSize: `${summary.percent}%` }" />
        </span>
        <span class="counts">{{ summary.translatedCount }}/{{ summary.translatable }}</span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { stateLabel, stateTone } from '../stateTone';

import type { StateSummary } from '@shared/state';

/**
 * How much of a container is done (MASTER_PLAN §5.4, §11.2).
 *
 * Renders **nothing** when there is nothing translatable underneath: §5.3's rule 4 says a
 * container with no translatable descendants has no state, and a full green bar would be
 * a lie about a folder of `translate="no"` units.
 *
 * The bar is coloured by the *worst* descendant rather than by the percentage — 99 % done
 * with one missing target is a different thing from 99 % done with one needing review.
 */

const props = defineProps<{ summary: StateSummary }>();

const tone = computed(() => (props.summary.worst === undefined ? 'muted' : stateTone(props.summary.worst)));
const title = computed(() => {
    const worst = props.summary.worst;
    const total = props.summary.total === props.summary.translatable
        ? `${props.summary.total} units`
        : `${props.summary.total} units, ${props.summary.translatable} translatable`;
    return worst === undefined ? total : `${total} — worst: ${stateLabel(worst)}`;
});
</script>

<style scoped>
.progress {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
}

.track {
    display: block;
    inline-size: 64px;
    block-size: 6px;
    border-radius: var(--radius-sm);
    background: var(--vscode-editorWidget-background);
    overflow: hidden;
}

.fill {
    display: block;
    block-size: 100%;
    background: currentColor;
}

.counts {
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
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
</style>

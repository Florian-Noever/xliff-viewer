<template>
    <header class="file-header">
        <div class="line">
            <h1 class="file-name">{{ document.fileName }}</h1>
            <span v-if="document.readOnly" class="tag">{{ document.isBaseFile ? 'base file · read-only' : 'read-only' }}</span>
            <ProgressBar class="bar" :summary="summary" />
            <span class="percent">{{ summary.percent }} %</span>
        </div>
        <p class="line meta">
            <span class="languages">{{ file.sourceLanguage }} → {{ file.targetLanguage ?? '—' }}</span>
            <span v-if="file.original !== undefined" class="original">{{ file.original }}</span>
            <span class="count">{{ summary.total }} units</span>
            <span v-if="baseFile !== undefined" class="base-file">{{ baseFile }}</span>
        </p>
    </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import ProgressBar from './ProgressBar.vue';

import type { XliffDocumentDto, XliffFileDto } from '@shared/dto';
import type { StateSummary } from '@shared/state';

/**
 * The file bar (MASTER_PLAN §11.2).
 *
 * Languages and `original` come from the **active** `XliffFileDto`, not from the document:
 * a document may hold several, and `DEC-020` lets the user switch between them.
 */

const props = defineProps<{
    document: XliffDocumentDto;
    file: XliffFileDto;
    summary: StateSummary;
}>();

/**
 * `undefined` means resolution has not run, `null` means it ran and found nothing
 * (`NAV-01`). Only the second is worth saying out loud.
 */
const baseFile = computed(() => {
    if (props.document.baseFile === undefined) {
        return undefined;
    }
    return props.document.baseFile === null ? 'no base file found' : `base: ${props.document.baseFile.fileName}`;
});
</script>

<style scoped>
.file-header {
    flex: none;
    padding: calc(var(--pad) * 1.5) calc(var(--pad) * 2);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gap);
    margin: 0;
}

.file-name {
    margin: 0;
    font-size: calc(var(--font) * 1.3);
    font-weight: 600;
}

.bar {
    margin-inline-start: auto;
}

.percent {
    font-variant-numeric: tabular-nums;
}

.tag {
    padding: 1px 6px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
}

.meta {
    margin-block-start: 4px;
    color: var(--vscode-descriptionForeground);
}

.languages {
    color: var(--vscode-foreground);
}
</style>

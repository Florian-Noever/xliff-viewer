<template>
    <header class="file-header">
        <div class="line">
            <h1 class="app-name">{{ title }}</h1>
            <label v-if="document.files.length > 1" class="switcher">
                <span class="switcher-label">File</span>
                <select
                    class="switcher-select"
                    :value="file.index"
                    @change="selectFile($event)"
                >
                    <option v-for="option in document.files" :key="option.index" :value="option.index">
                        {{ describe(option) }}
                    </option>
                </select>
            </label>
            <span v-if="document.readOnly" class="tag" :title="document.readOnlyReason">{{ document.isBaseFile ? 'base file · read-only' : 'read-only' }}</span>
            <ProgressBar class="bar" :summary="summary" />
            <span class="percent">{{ summary.percent }} %</span>
        </div>
        <p class="line meta">
            <span class="languages">{{ file.sourceLanguage }} → {{ file.targetLanguage ?? '—' }}</span>
            <span v-if="subtitle !== undefined" class="file-name">{{ subtitle }}</span>
            <span class="count">{{ unitCount }}</span>
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
 * Languages and `original` come from the **active** `XliffFileDto`, not from the document:
 * a document may hold several, and only one is shown at a time.
 */

const props = defineProps<{
    document: XliffDocumentDto;
    file: XliffFileDto;
    summary: StateSummary;
}>();

const emit = defineEmits<{ 'update:fileIndex': [index: number] }>();

function selectFile(event: Event): void {
    emit('update:fileIndex', Number((event.target as HTMLSelectElement).value));
}

const unitCount = computed(() => (props.summary.total === 1 ? '1 unit' : `${props.summary.total} units`));

/**
 * The app the translation belongs to, with the file name in the smaller line beneath.
 * `original` is optional in XLIFF, so a file that declares none is titled by its name.
 */
const title = computed(() => props.file.original ?? props.document.fileName);
const subtitle = computed(() => (props.file.original === undefined ? undefined : props.document.fileName));

/**
 * XLIFF allows several `<file>` elements; AL emits exactly one, so for an AL file the
 * switcher is not rendered at all.
 *
 * `original` alone is not enough to tell two apart — a document may hold the same app in
 * two languages — so the target language is always part of the label.
 */
function describe(option: XliffFileDto): string {
    const name = option.original ?? `File ${option.index + 1}`;
    return `${name} · ${option.sourceLanguage} → ${option.targetLanguage ?? '—'}`;
}

/**
 * `undefined` means resolution has not run, `null` means it ran and found nothing.
 * Only the second is worth saying out loud.
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

.app-name {
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

.switcher {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.switcher-label {
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
}

.switcher-select {
    padding: 2px 4px;
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
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

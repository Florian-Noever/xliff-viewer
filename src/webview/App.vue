<template>
    <main class="shell">
        <StatusPane
            v-if="blocking"
            :loading="loading"
            :error="error"
            variant="pane"
            @open-as-text="openAsText"
        />
        <template v-else>
            <StatusPane
                :loading="document === undefined ? loading : undefined"
                :error="error"
                variant="banner"
                @open-as-text="openAsText"
            />
            <header v-if="document !== undefined && activeFile !== undefined" class="file-header">
                <h1 class="file-name">
                    {{ document.fileName }}
                    <span v-if="document.readOnly" class="tag">read-only</span>
                </h1>
                <p class="summary">
                    <span class="languages">{{ activeFile.sourceLanguage }} → {{ activeFile.targetLanguage ?? '—' }}</span>
                    <span class="count">{{ unitCount }} translation units</span>
                    <span v-if="activeFile.original !== undefined" class="original">{{ activeFile.original }}</span>
                </p>
            </header>
            <p v-else class="placeholder">Waiting for a document…</p>
        </template>
    </main>
</template>

<script setup lang="ts">
import StatusPane from './components/StatusPane.vue';
import { useDesignTokens } from './composables/useDesignTokens';
import { useXliffDocument } from './composables/useXliffDocument';

useDesignTokens();

const { document, loading, error, activeFile, blocking, unitCount, openAsText } = useXliffDocument();
</script>

<style scoped>
.shell {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.file-header {
    padding: calc(var(--pad) * 1.5) calc(var(--pad) * 2);
    border-bottom: 1px solid var(--vscode-panel-border);
}

.file-name {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--gap);
    font-size: calc(var(--font) * 1.3);
    font-weight: 600;
}

.tag {
    padding: 1px 6px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
    font-weight: 400;
}

.summary {
    margin: 4px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--gap);
    color: var(--vscode-descriptionForeground);
}

.languages {
    color: var(--vscode-foreground);
}

.placeholder {
    margin: 0;
    padding: calc(var(--pad) * 2);
    color: var(--vscode-descriptionForeground);
}
</style>

<template>
    <main class="shell">
        <h1 class="title">XLIFF Viewer</h1>
        <p class="note">
            Webview shell is running. The real UI arrives with UI-01 … UI-04.
        </p>
        <dl class="facts">
            <dt>Host</dt>
            <dd>{{ isVscode ? 'VS Code webview' : 'browser (Vite dev server)' }}</dd>
        </dl>
    </main>
</template>

<script setup lang="ts">
import { useDesignTokens } from './composables/useDesignTokens';
import { isVscode } from './vscode';

useDesignTokens();
</script>

<style scoped>
.shell {
    padding: calc(var(--pad) * 2);
    display: flex;
    flex-direction: column;
    gap: var(--gap);
}

.title {
    margin: 0;
    font-size: calc(var(--font) * 1.6);
    font-weight: 600;
}

.note {
    margin: 0;
    color: var(--vscode-descriptionForeground);
}

.facts {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px var(--gap);
    padding: var(--pad);
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius-card);
    background: var(--vscode-editorWidget-background);
}

.facts dt {
    color: var(--vscode-descriptionForeground);
}

.facts dd {
    margin: 0;
}
</style>

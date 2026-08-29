<template>
    <main class="shell">
        <h1 class="title">XLIFF Viewer</h1>
        <p class="note">
            Toolchain smoke test. The real UI arrives with UI-01 … UI-04.
        </p>
        <dl class="facts">
            <dt>Host</dt>
            <dd>{{ isVscode ? 'VS Code webview' : 'browser (Vite dev server)' }}</dd>
            <dt>Document</dt>
            <dd>{{ document?.fileName ?? '—' }}</dd>
            <dt>Characters</dt>
            <dd>{{ document ? document.characters.toLocaleString() : '—' }}</dd>
        </dl>
    </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { useDesignTokens } from './composables/useDesignTokens';
import { isVscode, postMessage } from './vscode';

import { type DocumentInfo, isExtensionMessage, ExtensionMessageType, WebviewMessageType } from '@shared/messages';

useDesignTokens();

const document = ref<DocumentInfo | undefined>(undefined);

function onMessage(event: MessageEvent): void {
    if (!isExtensionMessage(event.data)) {
        return;
    }
    if (event.data.type === ExtensionMessageType.documentInfo) {
        document.value = event.data.payload;
    }
}

onMounted(() => {
    window.addEventListener('message', onMessage);
    postMessage({ type: WebviewMessageType.ready });
});

onUnmounted(() => {
    window.removeEventListener('message', onMessage);
});
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

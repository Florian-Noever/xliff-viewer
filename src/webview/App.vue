<template>
    <main class="shell">
        <h1 class="title">XLIFF Viewer</h1>
        <p class="note">
            Protocol smoke test. The real UI arrives with UI-01 … UI-04.
        </p>
        <dl class="facts">
            <dt>Host</dt>
            <dd>{{ isVscode ? 'VS Code webview' : 'browser (Vite dev server)' }}</dd>
            <dt>Status</dt>
            <dd>{{ status }}</dd>
            <dt>Edit mode</dt>
            <dd>{{ settings.editMode ? 'on' : 'off' }}</dd>
            <dt>Expand depth</dt>
            <dd>{{ settings.defaultExpandDepth }}</dd>
        </dl>
    </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { useDesignTokens } from './composables/useDesignTokens';
import { isVscode, postMessage } from './vscode';

import { ExtensionMessageType, isExtensionMessage, WebviewMessageType } from '@shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '@shared/settings';

import type { WebviewSettings } from '@shared/settings';

useDesignTokens();

const status = ref('—');
const settings = ref<WebviewSettings>(DEFAULT_WEBVIEW_SETTINGS);

function onMessage(event: MessageEvent): void {
    if (!isExtensionMessage(event.data)) {
        return;
    }
    switch (event.data.type) {
        case ExtensionMessageType.loading:
            status.value = event.data.payload.message;
            break;
        case ExtensionMessageType.error:
            status.value = event.data.payload.message;
            break;
        case ExtensionMessageType.settings:
            settings.value = event.data.payload;
            break;
        case ExtensionMessageType.setDocument:
            status.value = `${event.data.payload.fileName} — ${event.data.payload.files.length} file(s)`;
            break;
        default:
            break;
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

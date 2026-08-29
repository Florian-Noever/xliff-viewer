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
            <div class="body">
                <h1 class="title">XLIFF Viewer</h1>
                <p class="note">
                    Protocol smoke test. The real UI arrives with UI-01 … UI-04.
                </p>
                <dl class="facts">
                    <dt>Host</dt>
                    <dd>{{ isVscode ? 'VS Code webview' : 'browser (Vite dev server)' }}</dd>
                    <dt>Document</dt>
                    <dd>{{ document === undefined ? '—' : describe(document) }}</dd>
                    <dt>Edit mode</dt>
                    <dd>{{ settings.editMode ? 'on' : 'off' }}</dd>
                    <dt>Expand depth</dt>
                    <dd>{{ settings.defaultExpandDepth }}</dd>
                </dl>
            </div>
        </template>
    </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import StatusPane from './components/StatusPane.vue';
import { useDesignTokens } from './composables/useDesignTokens';
import { isVscode, postMessage } from './vscode';

import { ExtensionMessageType, isExtensionMessage, NavigationTarget, WebviewMessageType } from '@shared/messages';
import { DEFAULT_WEBVIEW_SETTINGS } from '@shared/settings';

import type { XliffDocumentDto } from '@shared/dto';
import type { ErrorPayload } from '@shared/messages';
import type { WebviewSettings } from '@shared/settings';

useDesignTokens();

const document = ref<XliffDocumentDto | undefined>(undefined);
const loading = ref<string | undefined>(undefined);
const error = ref<ErrorPayload | undefined>(undefined);
const settings = ref<WebviewSettings>(DEFAULT_WEBVIEW_SETTINGS);

/**
 * A failure blocks the view only when there is nothing behind it (§7.7). The host posts the
 * last good document ahead of an `error`, so a file broken mid-edit keeps its content and
 * gets a banner instead.
 */
const blocking = computed(() => document.value === undefined && (loading.value !== undefined || error.value !== undefined));

function describe(dto: XliffDocumentDto): string {
    const units = dto.files.reduce((total, file) => total + file.units.length, 0);
    return `${dto.fileName} — ${units} units in ${dto.files.length} file(s)${dto.readOnly ? ', read-only' : ''}`;
}

function openAsText(): void {
    postMessage({ type: WebviewMessageType.openSource, target: NavigationTarget.text });
}

function onMessage(event: MessageEvent): void {
    if (!isExtensionMessage(event.data)) {
        return;
    }
    switch (event.data.type) {
        case ExtensionMessageType.loading:
            loading.value = event.data.payload.message;
            error.value = undefined;
            break;
        case ExtensionMessageType.setDocument:
            // Always ahead of an `error` that follows it, so clearing here is safe.
            document.value = event.data.payload;
            loading.value = undefined;
            error.value = undefined;
            break;
        case ExtensionMessageType.error:
            error.value = event.data.payload;
            loading.value = undefined;
            break;
        case ExtensionMessageType.settings:
            settings.value = event.data.payload;
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
    height: 100%;
    display: flex;
    flex-direction: column;
}

.body {
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

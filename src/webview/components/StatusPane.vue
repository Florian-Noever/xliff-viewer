<template>
    <div
        v-if="loading !== undefined || error !== undefined"
        class="status-pane"
        :class="[variant, { 'is-error': error !== undefined }]"
        :role="error !== undefined ? 'alert' : undefined"
        :aria-live="error === undefined ? 'polite' : undefined"
    >
        <div v-if="error === undefined" class="spinner" aria-hidden="true" />
        <div v-else class="icon" aria-hidden="true">⚠</div>

        <div class="text">
            <span class="message">{{ error?.message ?? loading }}</span>
            <span v-if="position !== undefined" class="position">{{ position }}</span>
        </div>

        <button v-if="error !== undefined" type="button" class="action" @click="emit('openAsText')">
            Open as text
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { ErrorPayload } from '@shared/messages';

/**
 * The document-level loading and failure surface.
 *
 * `pane` blocks the view and is for a document that has never parsed. `banner` sits above
 * a document that is still displayable: a file broken by an edit in progress keeps its
 * last good tree.
 */

const props = defineProps<{
    /** The loading message; absent means "not loading". */
    loading?: string;
    /** Present means failed. Takes precedence over `loading`. */
    error?: ErrorPayload;
    variant?: 'pane' | 'banner';
}>();

const emit = defineEmits<{ openAsText: [] }>();

/** The validator reports a line without a column often enough to be worth handling. */
const position = computed(() => {
    if (props.error?.line === undefined) {
        return undefined;
    }
    return props.error.col === undefined
        ? `Line ${props.error.line}`
        : `Line ${props.error.line}, column ${props.error.col}`;
});
</script>

<style scoped>
.status-pane {
    display: flex;
    align-items: center;
    gap: var(--gap);
    padding: var(--pad);
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius-card);
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-foreground);
}

.status-pane.pane {
    margin: calc(var(--pad) * 2);
}

.status-pane.banner {
    border-radius: 0;
    border-width: 0 0 1px 0;
}

.status-pane.is-error {
    border-color: var(--vscode-inputValidation-errorBorder);
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-foreground));
}

.icon {
    color: var(--vscode-errorForeground);
    font-size: calc(var(--font) * 1.2);
    line-height: 1;
}

.text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.message {
    overflow-wrap: anywhere;
}

.position {
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.9);
}

.action {
    margin-left: auto;
    flex: none;
    padding: 4px 10px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: var(--radius-md);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    font: inherit;
    cursor: pointer;
}

.action:hover {
    background: var(--vscode-button-secondaryHoverBackground);
}

.spinner {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--vscode-panel-border);
    border-top-color: var(--vscode-progressBar-background);
}

@media (prefers-reduced-motion: no-preference) {
    .spinner {
        animation: spin var(--duration-spin) linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
}
</style>

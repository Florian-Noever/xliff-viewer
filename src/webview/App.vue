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
            <FileHeader
                v-if="document !== undefined && activeFile !== undefined"
                :document="document"
                :file="activeFile"
                :summary="rollup.file.value"
                @update:file-index="activeFileIndex = $event"
            />
            <Toolbar v-if="activeFile !== undefined" :search="search" />
            <UnitTree
                v-if="activeFile !== undefined"
                :tree="tree"
                :summaries="rollup.byKey.value"
                :settings="settings"
            />
            <p v-else class="placeholder">Waiting for a document…</p>
        </template>
    </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import FileHeader from './components/FileHeader.vue';
import StatusPane from './components/StatusPane.vue';
import Toolbar from './components/Toolbar.vue';
import UnitTree from './components/UnitTree.vue';
import { useDesignTokens } from './composables/useDesignTokens';
import { useRollup } from './composables/useRollup';
import { useSearch } from './composables/useSearch';
import { useTreeFlatten } from './composables/useTreeFlatten';
import { useXliffDocument } from './composables/useXliffDocument';

useDesignTokens();

const { document, loading, error, settings, activeFile, activeFileIndex, unitsById, blocking, openAsText } = useXliffDocument();

const search = useSearch({ file: activeFile, unitsById });

const tree = useTreeFlatten({
    file: activeFile,
    unitsById,
    defaultExpandDepth: computed(() => settings.value.defaultExpandDepth),
    documentUri: computed(() => document.value?.uri),
    visible: search.matches,
});

const rollup = useRollup({ file: activeFile, unitsById });
</script>

<style scoped>
.shell {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.placeholder {
    margin: 0;
    padding: calc(var(--pad) * 2);
    color: var(--vscode-descriptionForeground);
}
</style>

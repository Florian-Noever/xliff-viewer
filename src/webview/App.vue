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
            <Toolbar
                v-if="activeFile !== undefined"
                :search="search"
                :filter="filter"
                :edit="edit"
                :match-count="filtered?.count"
                @expand-all="tree.expandAll()"
                @collapse-all="tree.collapseAll()"
            />
            <UnitTree
                v-if="activeFile !== undefined"
                :tree="tree"
                :summaries="rollup.byKey.value"
                :hints="validation.byUnit.value"
                :hint-counts="validation.countByKey.value"
                :settings="settings"
                :editing="edit.active.value"
                :target-language="activeFile.targetLanguage"
            />
            <p v-else class="placeholder">Waiting for a document…</p>
        </template>

        <!-- Off screen, never empty of purpose: what changed, for a reader who cannot see it. -->
        <p class="sr-only" role="status" aria-live="polite">{{ announcer.message.value }}</p>
    </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import FileHeader from './components/FileHeader.vue';
import StatusPane from './components/StatusPane.vue';
import Toolbar from './components/Toolbar.vue';
import UnitTree from './components/UnitTree.vue';
import { useAnnouncer } from './composables/useAnnouncer';
import { useDesignTokens } from './composables/useDesignTokens';
import { useEditMode } from './composables/useEditMode';
import { useRollup } from './composables/useRollup';
import { useSearch } from './composables/useSearch';
import { useStateFilter } from './composables/useStateFilter';
import { useTreeFlatten } from './composables/useTreeFlatten';
import { useValidation } from './composables/useValidation';
import { useXliffDocument } from './composables/useXliffDocument';
import { visibleNodes } from './ancestorFilter';
import { provideUnitActions } from './unitActions';

useDesignTokens();

const announcer = useAnnouncer();

const {
    document,
    loading,
    error,
    settings,
    activeFile,
    activeFileIndex,
    unitsById,
    blocking,
    openAsText,
    openSource,
    updateTarget,
    updateState,
} = useXliffDocument({ announce: announcer.announce });

provideUnitActions({
    open: (target, unitId) => openSource(target, unitId),
    baseFileName: () => {
        const resolved = document.value?.baseFile;
        return resolved === undefined || resolved === null ? resolved : resolved.fileName;
    },
    // §12.3: a state the reader chose for this unit outranks `stateOnEdit` on a later
    // edit to its text, so it travels with the message rather than being remembered twice.
    updateTarget: (unitId, value) => updateTarget(unitId, value, edit.chosenState(unitId)),
    updateState: (unitId, state) => {
        edit.rememberState(unitId, state);
        updateState(unitId, state);
    },
});

const edit = useEditMode({ document, settings });
const rollup = useRollup({ file: activeFile, unitsById });
const validation = useValidation({ file: activeFile, settings });
const search = useSearch({ file: activeFile, unitsById });
const filter = useStateFilter({
    summary: rollup.file,
    unitsById,
    scope: computed(() => `${document.value?.uri ?? ''}#${activeFileIndex.value}`),
});

/**
 * Search and the state filter narrow to the intersection (§11.5). They compose as
 * predicates rather than as two finished sets — `ancestorFilter.ts` explains why.
 */
const filtered = computed(() => visibleNodes(
    activeFile.value?.tree ?? [],
    [search.predicate.value, filter.predicate.value].filter(each => each !== undefined),
));

const tree = useTreeFlatten({
    file: activeFile,
    unitsById,
    defaultExpandDepth: computed(() => settings.value.defaultExpandDepth),
    documentUri: computed(() => document.value?.uri),
    visible: computed(() => filtered.value?.visible),
});
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

<template>
    <div class="tree-container">
        <p v-if="tree.showFlatNote.value" class="flat-note" role="note">
            <span>This file's unit ids carry no AL object structure, so there is nothing to group by. Showing every unit as a flat list.</span>
            <button type="button" class="dismiss" aria-label="Dismiss this note" @click="tree.dismissFlatNote()">
                <!-- eslint-disable-next-line vue/no-v-html -- a build-time constant from @vscode/codicons, never user input -->
                <span class="glyph" v-html="Icon.close" />
            </button>
        </p>

        <div
            ref="scroller"
            class="scroller"
            role="tree"
            aria-label="Translation units"
            :tabindex="rows.length === 0 ? -1 : 0"
            @keydown="onKeydown"
        >
            <div class="spacer" :style="{ height: `${virtualizer.getTotalSize()}px` }">
                <div class="viewport" :style="{ transform: `translateY(${offset}px)` }">
                    <TreeRow
                        v-for="item in virtualItems"
                        :key="rows[item.index].key"
                        :ref="measure(item.index)"
                        :data-index="item.index"
                        :row="rows[item.index]"
                        :settings="settings"
                        :editing="editing"
                        :target-language="targetLanguage"
                        :generator-note="generatorNoteFor(rows[item.index])"
                        :hints="hints?.get(rows[item.index].key)"
                        :hint-count="hintCounts?.get(rows[item.index].key)"
                        :summary="summaries?.get(rows[item.index].key)"
                        :focused="rows[item.index].key === tree.focusedKey.value"
                        @toggle="tree.toggle($event)"
                        @focus="tree.focus($event)"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual';
import { computed, ref, watch } from 'vue';

import TreeRow from './TreeRow.vue';
import { ROW_HEIGHT } from '../constants';
import { reconstructGeneratorNote } from '../generatorNote';
import { Icon } from '../icons';

import type { TreeRow as Row, TreeView } from '../composables/useTreeFlatten';
import type { Hint } from '../validation';
import type { StateSummary } from '@shared/state';
import type { WebviewSettings } from '@shared/settings';
import type { ComponentPublicInstance } from 'vue';

/**
 * The virtualiser over the flattened rows (MASTER_PLAN §11.4).
 *
 * Rows are measured rather than assumed: a container row is one line today, and a unit
 * card will not be (`UI-04`). `measureElement` is what keeps the scrollbar honest once
 * they differ.
 */

const OVERSCAN = 8;

/**
 * What a keystroke belongs to when it does not belong to the tree.
 *
 * The handler sits on the scroller, so everything typed into a row bubbles through it. A
 * target field needs Space, Enter, the arrows and Home/End far more than the tree does.
 */
const CONTROL_SELECTOR = 'input, textarea, select, button, [contenteditable="true"]';

/** Key → intent. The mapping is presentation; what each intent *does* is the composable's (§11.7). */
const KEY_ACTIONS: Readonly<Record<string, (tree: TreeView) => void>> = {
    ArrowDown: tree => tree.moveFocus(1),
    ArrowUp: tree => tree.moveFocus(-1),
    ArrowRight: tree => tree.expandFocused(),
    ArrowLeft: tree => tree.collapseFocused(),
    Home: tree => tree.moveFocus(Number.NEGATIVE_INFINITY),
    End: tree => tree.moveFocus(Number.POSITIVE_INFINITY),
    Enter: (tree) => {
        const row = tree.rows.value[tree.focusedIndex.value];
        if (row?.hasChildren === true) {
            tree.toggle(row.key);
        }
    },
    ' ': (tree) => {
        const row = tree.rows.value[tree.focusedIndex.value];
        if (row?.hasChildren === true) {
            tree.toggle(row.key);
        }
    },
};

const props = defineProps<{
    tree: TreeView;
    /** Node key → roll-up. Optional so the tree renders before `UI-03`'s summaries exist. */
    summaries?: ReadonlyMap<string, StateSummary>;
    settings?: WebviewSettings;
    /** The active `<file>`'s target language, which labels a unit's translation row (`DEC-034`). */
    targetLanguage?: string;
    /** Unit id → its §12.4 hints, and node key → how many carry one beneath it. */
    hints?: ReadonlyMap<string, readonly Hint[]>;
    hintCounts?: ReadonlyMap<string, number>;
    /** Editing is on and allowed, so a unit's target and state become fields (§12.2). */
    editing?: boolean;
}>();

/**
 * Rebuilt per rendered row rather than per unit: `showGeneratorNotes` is off by default,
 * and only the rows on screen — some thirty of them — ever need it (§4.4).
 */
function generatorNoteFor(row: Row): string | undefined {
    if (props.settings?.showGeneratorNotes !== true || row.unit === undefined) {
        return undefined;
    }
    return reconstructGeneratorNote(row.key, props.tree.nodesByKey.value);
}

const scroller = ref<HTMLElement | null>(null);
const rows = computed(() => props.tree.rows.value);

const virtualizer = useVirtualizer(computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scroller.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // Rows are keyed by node key so a re-parse or an expansion does not reshuffle
    // measurements onto the wrong rows.
    getItemKey: (index: number) => rows.value[index]?.key ?? index,
})));

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const offset = computed(() => virtualItems.value[0]?.start ?? 0);

/** `measureElement` wants the DOM node; a Vue component ref hands over its root. */
const measure = (index: number) => (instance: Element | ComponentPublicInstance | null): void => {
    const element = instance instanceof Element ? instance : (instance?.$el as Element | undefined);
    if (element !== undefined && element !== null) {
        element.setAttribute('data-index', index.toString());
        virtualizer.value.measureElement(element);
    }
};

/** Keeps the focused row on screen when the keyboard moves past the rendered window. */
watch(() => props.tree.focusedIndex.value, (index) => {
    if (index >= 0) {
        virtualizer.value.scrollToIndex(index);
    }
});

function onKeydown(event: KeyboardEvent): void {
    const handled = KEY_ACTIONS[event.key];
    if (handled === undefined || startedInAControl(event.target)) {
        return;
    }
    event.preventDefault();
    handled(props.tree);
}

/** `closest`, not an instance check: the glyph inside a button is what gets the event. */
function startedInAControl(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(CONTROL_SELECTOR) !== null;
}
</script>

<style scoped>
.tree-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.flat-note {
    display: flex;
    align-items: center;
    gap: var(--gap);
    margin: 0;
    padding: var(--pad) calc(var(--pad) * 2);
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-descriptionForeground);
}

.dismiss {
    flex: none;
    margin-inline-start: auto;
    display: inline-flex;
    padding: 2px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: inherit;
    cursor: pointer;
}

.dismiss:hover {
    background: var(--vscode-list-hoverBackground);
}

.glyph {
    display: inline-flex;
    width: 16px;
    height: 16px;
}

.scroller {
    flex: 1;
    min-height: 0;
    overflow: auto;
    contain: strict;
}

.spacer {
    position: relative;
    width: 100%;
}

.viewport {
    position: absolute;
    inset-inline: 0;
    top: 0;
}
</style>

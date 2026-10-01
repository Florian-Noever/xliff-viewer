<template>
    <div
        :id="rowId"
        class="tree-row"
        :class="{ 'is-focused': focused, 'is-container': row.hasChildren }"
        role="treeitem"
        :aria-level="row.depth + 1"
        :aria-posinset="row.position"
        :aria-setsize="row.siblings"
        :aria-expanded="row.hasChildren ? row.expanded : undefined"
        :style="{ paddingInlineStart: `calc(var(--row-indent) * ${row.depth})` }"
        @click="onClick"
    >
        <button
            v-if="row.hasChildren"
            type="button"
            class="chevron"
            tabindex="-1"
            :aria-label="`${row.expanded ? 'Collapse' : 'Expand'} ${label}`"
            @click.stop="emit('toggle', row.key)"
        >
            <!-- eslint-disable-next-line vue/no-v-html -- a build-time constant from @vscode/codicons, never user input -->
            <span class="glyph" v-html="row.expanded ? Icon.chevronDown : Icon.chevronRight" />
        </button>
        <span v-else class="chevron-spacer" aria-hidden="true" />

        <span v-if="row.group !== true" class="type">{{ row.type }}</span>
        <!-- A unit's name is its box's legend, so the row does not repeat it —
             unless there is no box, which is a tree rendered before its settings arrived. -->
        <span v-if="row.unit === undefined || settings === undefined" class="name" :class="{ 'is-muted': withoutNamespace }">{{ label }}</span>
        <UnitCard
            v-else
            class="card"
            :unit="row.unit"
            :settings="settings"
            :editing="editing"
            :name="row.name"
            :target-language="targetLanguage"
            :generator-note="generatorNote"
            :hints="hints"
        />
        <!-- Only a row without a box needs pushing: the box itself fills the space. -->
        <span v-if="row.unit === undefined || settings === undefined" class="spacer" />
        <span v-if="pairing !== undefined" class="pairing" :class="pairing.tone" :title="pairing.title">{{ pairing.label }}</span>
        <!-- Containers only: a unit row's card already says the hint in words, and the
             count exists to say which collapsed branch is worth opening. -->
        <span v-if="row.unit === undefined && hintCount !== undefined && hintCount > 0" class="hint-count" :title="hintTitle">
            <span aria-hidden="true">⚠</span>{{ hintCount }}
        </span>
        <div v-if="row.unit !== undefined" class="unit-side">
            <button
                type="button"
                class="action"
                :disabled="!source.enabled"
                :title="source.title"
                @click.stop="actions.open(NavigationTarget.source, row.unit.id)"
            >
                Go to source
            </button>
        </div>
        <ProgressBar v-else-if="summary !== undefined" :summary="summary" />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import ProgressBar from './ProgressBar.vue';
import UnitCard from './UnitCard.vue';
import { Icon } from '../icons';
import { sourceAction } from '../sourceAction';
import { useUnitActions } from '../unitActions';
import { NavigationTarget } from '@shared/messages';
import { lastSegmentLabel, NAMESPACE_TYPE } from '@shared/unitPath';

import type { TreeRow } from '../composables/useTreeFlatten';
import type { Hint } from '../validation';
import type { StateSummary } from '@shared/state';
import type { WebviewSettings } from '@shared/settings';

const props = defineProps<{
    row: TreeRow;
    focused: boolean;
    /**
     * What the tree's `aria-activedescendant` points at.
     *
     * DOM focus stays on the tree, not on the row, so a screen reader has no other way to
     * be told which row the arrow keys are on. Absent in tests that mount a row alone.
     */
    rowId?: string;
    /** The roll-up for this node. Absent on a unit row, which shows its own state instead. */
    summary?: StateSummary;
    settings?: WebviewSettings;
    /** The active `<file>`'s target language, which labels a unit's translation row. */
    targetLanguage?: string;
    /** Editing is on and allowed, so a unit's target and state become fields. */
    editing?: boolean;
    /** Rebuilt from the tree by the caller, since the payload does not carry it. */
    generatorNote?: string;
    /** This unit's validation hints. Absent on a container, which shows `hintCount` instead. */
    hints?: readonly Hint[];
    /** How many units beneath this node carry a hint. Absent when none do. */
    hintCount?: number;
}>();

const emit = defineEmits<{
    toggle: [key: string];
    focus: [key: string];
}>();

/**
 * A whole container row is its own chevron: clicking it opens or closes it, and the
 * chevron stays as the affordance that says so.
 *
 * A row with no children does nothing at all — no cursor, no hover, no focus change. There
 * is nothing to toggle, and a unit row is content to read rather than a control to press.
 */
function onClick(event: MouseEvent): void {
    if (!props.row.hasChildren || !isPlainClick(event)) {
        return;
    }
    emit('focus', props.row.key);
    emit('toggle', props.row.key);
}

/**
 * A click that means what it looks like.
 *
 * Two do not: the end of a drag that selected text, and one that landed inside a unit card
 * — an id can be another unit's prefix, so a row can carry both children and a card, and
 * the card's text is what the reader came for.
 */
function isPlainClick(event: MouseEvent): boolean {
    if (event.target instanceof Element && event.target.closest('.card') !== null) {
        return false;
    }
    return window.getSelection()?.isCollapsed !== false;
}

/**
 * The generator note could not be parsed for this node, so there is no name.
 * Showing the hash is better than showing nothing: it is what the id says, and it is what
 * a search of the raw file will match.
 */
const label = computed(() => props.row.name ?? lastSegmentLabel(props.row.key));

/** The group of objects that have no namespace, in a file where the others have one. */
const withoutNamespace = computed(() => props.row.group === true && props.row.type === NAMESPACE_TYPE);

/** Units, not hints: "3" should mean three translations to look at, not one with three faults. */
const hintTitle = computed(() => {
    const count = props.hintCount ?? 0;
    return `${count} ${count === 1 ? 'translation' : 'translations'} below this one ${count === 1 ? 'has' : 'have'} something worth checking.`;
});

const actions = useUnitActions();

/** Whether the one action can go anywhere, and the title that says where — or why not. */
const source = computed(() => sourceAction({
    alSource: actions.alSourceAvailable(),
    baseFile: actions.baseFileName(),
    isBaseFile: actions.isBaseFile(),
    orphaned: props.row.unit?.orphaned === true,
}));

/**
 * A drifted unit is worth seeing without opening anything. Informational only — it
 * never changes a state and never blocks an edit.
 */
const pairing = computed(() => {
    const unit = props.row.unit;
    if (unit?.orphaned === true) {
        return { label: 'orphaned', tone: 'orphaned', title: 'The base file no longer has this unit.' };
    }
    if (unit?.baseSource !== undefined) {
        return { label: 'source changed', tone: 'changed', title: 'The base file’s source differs from this one.' };
    }
    return undefined;
});
</script>

<style scoped>
.tree-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-height: var(--row-height);
    padding-block: 2px;
    padding-inline-end: var(--pad);
    cursor: default;
    white-space: nowrap;
}

.tree-row.is-container {
    cursor: pointer;
}

/* Everything on a container row sits on one line; a unit's card is the exception. */
.tree-row > :not(.card) {
    margin-block: calc((var(--row-height) - 1.4em) / 2);
}

.card {
    flex: 1;
    min-width: 0;
    white-space: normal;
    margin-block: 0;
    cursor: text;
}

.tree-row.is-container:hover {
    background: var(--vscode-list-hoverBackground);
}

/* Keyboard position, not selection: the row the arrow keys are on is outlined rather than
   filled, so the tree never looks like a list with a selected item. */
.tree-row.is-focused {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
}

.tree-row:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
}

.chevron,
.chevron-spacer {
    flex: none;
    width: 16px;
    height: 16px;
}

.chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: none;
    color: var(--vscode-foreground);
    cursor: pointer;
}

.glyph {
    display: inline-flex;
    width: 16px;
    height: 16px;
}

/*
 * Advisory, so it is a quiet count rather than a badge: the tone says "look here", the
 * progress bar beside it still says how the branch is doing.
 */
.hint-count {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--vscode-editorWarning-foreground);
    font-size: calc(var(--font) * 0.9);
    font-variant-numeric: tabular-nums;
}

.pairing {
    flex: none;
    padding: 0 5px;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    font-size: calc(var(--font) * 0.85);
}

.pairing.orphaned {
    color: var(--vscode-errorForeground);
}

.pairing.changed {
    color: var(--vscode-editorWarning-foreground);
}

.type {
    flex: none;
    padding: 0 5px;
    border-radius: var(--radius-sm);
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
}

.name.is-muted {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
}

.name {
    flex: none;
    overflow: hidden;
    text-overflow: ellipsis;
}

.spacer {
    flex: 1;
    min-width: var(--gap);
}

/* The state and the one thing to do about it, in that order, on the right of the row. */
.unit-side {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
}

.action {
    padding: 1px 7px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: var(--radius-sm);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    font: inherit;
    font-size: calc(var(--font) * 0.85);
    cursor: pointer;
}

.action:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
}

.action:disabled {
    border-style: dashed;
    background: none;
    color: var(--vscode-descriptionForeground);
    cursor: default;
}
</style>

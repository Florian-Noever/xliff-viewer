<template>
    <div class="unit-card" :class="{ muted: !unit.translate, editing }">
        <section class="box" :aria-labelledby="legendId">
            <p :id="legendId" class="legend">
                <span class="legend-name">{{ name }}</span>
                <StateBadge v-if="!editing" :state="unit.state" :muted="!unit.translate" />
                <select
                    v-else
                    class="state-select"
                    :value="isSpecState(unit.state) ? unit.state : ''"
                    :aria-label="`Translation state of ${name}`"
                    @change="commitState($event)"
                >
                    <option v-if="!isSpecState(unit.state)" value="" disabled>{{ stateLabel(unit.state) }}</option>
                    <option v-for="state in SPEC_STATES" :key="state" :value="state">{{ stateLabel(state) }}</option>
                </select>
            </p>

            <dl class="strings">
                <dt class="label">Original</dt>
                <dd class="value source">
                    <span v-if="unit.source === ''" class="absent">(empty source)</span>
                    <span v-else>{{ unit.source }}</span>
                </dd>

                <template v-for="(translation, index) in rows" :key="index">
                    <dt class="label">
                        <label v-if="editing" :for="targetId">{{ translationLabel(translation) }}</label>
                        <template v-else>{{ translationLabel(translation) }}</template>
                    </dt>
                    <dd class="value target">
                        <textarea
                            v-if="editing"
                            :id="targetId"
                            :ref="fitOnMount"
                            class="target-input"
                            :rows="targetRows"
                            :style="fieldStyle"
                            spellcheck="false"
                            :value="translation.value ?? ''"
                            @input="fitOnInput($event)"
                            @blur="commitTarget($event)"
                            @keydown.esc.prevent="revert($event)"
                        />
                        <span v-else-if="translation.value === undefined" class="absent">no target</span>
                        <span v-else-if="translation.value === ''" class="absent">empty target</span>
                        <template v-else-if="whitespace !== undefined">
                            <span class="ws" :title="explanation">{{ visible.lead }}</span><span>{{ visible.core }}</span><span class="ws" :title="explanation">{{ visible.trail }}</span>
                        </template>
                        <span v-else>{{ translation.value }}</span>
                    </dd>
                </template>
            </dl>
        </section>

        <p v-if="whitespace !== undefined" class="whitespace-note">{{ explanation }}</p>

        <ul v-if="hints !== undefined && hints.length > 0" class="hints">
            <li v-for="advice in hints" :key="advice.kind" class="hint">
                <span class="hint-mark" aria-hidden="true">⚠</span>
                <span>{{ advice.message }}</span>
            </li>
        </ul>

        <p v-if="unit.orphaned === true" class="pairing orphaned">
            The base file no longer has this unit. It was probably removed from the AL source.
        </p>
        <div v-else-if="unit.baseSource !== undefined" class="pairing changed">
            <p class="pairing-note">The source has changed since this was translated. The base file now says:</p>
            <p class="base-source">{{ unit.baseSource === '' ? '(empty)' : unit.baseSource }}</p>
        </div>

        <dl v-if="hint !== undefined" class="aside">
            <dt class="label">Suggested</dt>
            <dd class="value">{{ hint }}</dd>
        </dl>

        <NoteList
            class="note-list"
            :notes="unit.notes"
            :show-developer-notes="settings.showDeveloperNotes"
            :generator-note="generatorNote"
        />

        <MetaChips class="chips" :unit="unit" />
    </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';

import MetaChips from './MetaChips.vue';
import NoteList from './NoteList.vue';
import StateBadge from './StateBadge.vue';
import { FIELD_MAX_COLUMNS, FIELD_MIN_COLUMNS } from '../constants';
import { stateLabel } from '../stateTone';
import { translationLabel, translations } from '../translations';
import { useUnitActions } from '../unitActions';
import { isSpecState, SPEC_STATES } from '@shared/state';
import { lastSegmentLabel } from '@shared/unitPath';
import { loadBearingWhitespace, whitespaceExplanation, whitespaceParts, WhitespaceReason } from '../whitespace';

import type { TransUnitDto } from '@shared/dto';
import type { WebviewSettings } from '@shared/settings';
import type { Hint } from '../validation';

/**
 * One trans-unit, as a **labelled box**: the legend names the translated element and carries
 * its state, and the strings are label/value pairs of a description list, so no line relies
 * on colour alone. `<legend>` belongs to form controls, so the box is labelled with
 * `aria-labelledby`. Read-only text renders as text, never as a disabled input.
 */

const SPACE_MARK = '␣';

const props = defineProps<{
    unit: TransUnitDto;
    settings: WebviewSettings;
    /** The active `<file>`'s target language, which labels the translation row. */
    targetLanguage?: string;
    /** The node's display name, which is the box's legend. Falls back to the id's last segment. */
    name?: string;
    /** Reconstructed by the caller when `showGeneratorNotes` is on. */
    generatorNote?: string;
    /** Editing is on **and** allowed. Read-only renders text, never a disabled input. */
    editing?: boolean;
    /** The validation hints for this unit. Advisory: nothing here blocks or changes anything. */
    hints?: readonly Hint[];
}>();

const actions = useUnitActions();
const legendId = useId();
const targetId = useId();

const editing = computed(() => props.editing === true);

/**
 * The rows the field starts with, until `fit` sizes it to its content on mount: enough that
 * a multi-line target does not open in a one-line slot.
 */
const targetRows = computed(() => Math.min(8, Math.max(1, (props.unit.target ?? '').split('\n').length)));

const longestLine = (value: string) => value.split('\n').reduce((widest, line) => Math.max(widest, line.length), 0);

/**
 * **Floors**, not sizes: `field-sizing: content` widens the field as it is typed into, up to
 * `--field-max-inline`, and an `inline-size` would freeze it. Height has no cap; one line is
 * as far as `resize: vertical` may fold a target.
 */
const fieldStyle = computed(() => ({
    minInlineSize: `${Math.min(FIELD_MAX_COLUMNS, Math.max(FIELD_MIN_COLUMNS, longestLine(props.unit.source)))}ch`,
    minBlockSize: 'calc(1lh + var(--field-chrome))',
}));

/**
 * Fits the field's height to what it holds, shrinking as well as growing. `scrollHeight`
 * leaves out the border that `border-box` counts, and it rounds, so the extra pixel stops
 * a scrollbar.
 */
function fit(field: HTMLTextAreaElement): void {
    field.style.blockSize = 'auto';
    field.style.blockSize = `${field.scrollHeight + field.offsetHeight - field.clientHeight + 1}px`;
}

function fitOnInput(event: Event): void {
    fit(event.target as HTMLTextAreaElement);
}

/**
 * A function ref rather than `onMounted`: the field lives in a `v-for` inside a virtualiser,
 * so it mounts and unmounts as the tree scrolls. A target that wraps has to open at its full
 * height, not at the one line `rows` would give it.
 */
function fitOnMount(element: unknown): void {
    if (element instanceof HTMLTextAreaElement) {
        fit(element);
    }
}

/**
 * Committed on **blur**, never per keystroke, which would make each keystroke an undo step.
 * The value is taken verbatim: a single space is a translation.
 */
function commitTarget(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    if (value !== (props.unit.target ?? '')) {
        actions.updateTarget(props.unit.id, value);
    }
}

/** Escape abandons what was typed and puts the committed value back. */
function revert(event: Event): void {
    const field = event.target as HTMLTextAreaElement;
    field.value = props.unit.target ?? '';
    field.blur();
}

function commitState(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isSpecState(value) && value !== props.unit.state) {
        actions.updateState(props.unit.id, value);
    }
}

const name = computed(() => props.name ?? lastSegmentLabel(props.unit.id));
const rows = computed(() => translations(props.unit, props.targetLanguage));

const whitespace = computed(() => loadBearingWhitespace(props.unit.source, props.unit.target));
const explanation = computed(() => (whitespace.value === undefined ? undefined : whitespaceExplanation(whitespace.value)));

/** Renders the load-bearing spaces as something the eye can see, and only those. */
const visible = computed(() => {
    const target = props.unit.target ?? '';
    if (whitespace.value === WhitespaceReason.only) {
        return { lead: target.replace(/\s/g, SPACE_MARK), core: '', trail: '' };
    }
    const parts = whitespaceParts(target);
    return {
        lead: parts.lead.replace(/\s/g, SPACE_MARK),
        core: parts.core,
        trail: parts.trail.replace(/\s/g, SPACE_MARK),
    };
});

/**
 * What the `Developer` note suggests for this file's language, shown only where it tells the
 * reader something new: not once the translator has used it, which would print the target twice.
 */
const hint = computed(() => {
    const suggestion = props.unit.developerHint;
    return props.settings.showDeveloperNotes && suggestion !== props.unit.target ? suggestion : undefined;
});
</script>

<style scoped>
.unit-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    /* The trailing space is what separates one translation from the next. */
    padding-block: 2px var(--gap);
}

.unit-card > * + * {
    margin-block-start: 3px;
}

/* The same space as under the legend. */
.box + * {
    margin-block-start: calc(var(--gap) / 2);
}

.unit-card.muted {
    color: var(--vscode-descriptionForeground);
}

/* Fits its contents, and wraps a long string at the width the row has left. */
.box {
    align-self: flex-start;
    max-width: 100%;
    min-width: 0;
    padding: 2px 8px 4px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius-sm);
}

.legend {
    display: flex;
    align-items: center;
    gap: var(--gap);
    margin: 0 0 calc(var(--gap) / 2);
}

.legend-name {
    font-weight: 600;
    overflow-wrap: anywhere;
}

/* An auto margin, so anything else in the legend stays beside the name. */
.legend .state-badge {
    margin-inline-start: auto;
}

/*
 * The box's columns, repeated below it so a note lines up with the string it is about.
 * `NoteList` has the same grid, and `--label-column` keeps the separate grids in step.
 */
.strings,
.aside {
    display: grid;
    grid-template-columns: minmax(0, var(--label-column)) minmax(0, 1fr);
    gap: 1px var(--gap);
    margin: 0;
}

/* A bordered field one pixel under the source reads as a strikethrough through it. */
.unit-card.editing .strings {
    row-gap: 4px;
}

/* The box's border plus its padding, so the columns continue straight through it. */
.aside,
.note-list {
    padding-inline: 9px;
}

.target-input {
    /* The padding and border below, which `min-block-size` and `fit` allow for. */
    --field-chrome: 8px;

    display: block;
    box-sizing: border-box;
    /* The field grows with what is typed into it, in both directions, as it is typed. */
    field-sizing: content;
    max-inline-size: min(var(--field-max-inline), 100%);
    /* Room to put the caret before the first character and after the last one. */
    padding: 3px 7px;
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
    /* Keeps the target's own spaces and line breaks. */
    white-space: pre-wrap;
    resize: vertical;
}

.state-select {
    margin-inline-start: auto;
    padding: 0 4px;
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
    font-size: calc(var(--font) * 0.85);
}

/* No label of their own, so they start where the values do. */
.chips {
    padding-inline: calc(9px + var(--label-column) + var(--gap)) 9px;
}

.label {
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.value {
    margin: 0;
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.source {
    color: var(--vscode-descriptionForeground);
}

.absent {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
}

.ws {
    border-radius: 2px;
    background: var(--vscode-editorWidget-background);
    color: var(--vscode-editorWarning-foreground);
}

.whitespace-note {
    margin: 0;
    padding-inline: 9px;
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
}

/* Advisory, so they read as an aside rather than as an error the reader has to clear. */
.hints {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding-inline: 9px;
    list-style: none;
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
}

.hint {
    display: flex;
    gap: 5px;
}

.hint-mark {
    flex: none;
    color: var(--vscode-editorWarning-foreground);
}

.pairing {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 3px 7px;
    border-inline-start: 2px solid currentColor;
    border-radius: var(--radius-sm);
    background: var(--vscode-editorWidget-background);
    font-size: calc(var(--font) * 0.9);
}

.pairing.orphaned {
    color: var(--vscode-errorForeground);
}

.pairing.changed {
    color: var(--vscode-editorWarning-foreground);
}

.pairing-note,
.base-source {
    margin: 0;
}

.base-source {
    color: var(--vscode-foreground);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
</style>

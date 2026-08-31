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
                            ref="editor"
                            class="target-input"
                            :rows="targetRows"
                            :style="fieldStyle"
                            spellcheck="false"
                            :value="translation.value ?? ''"
                            @input="fitHeight($event)"
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
import { DEVELOPER_NOTE } from '../constants';
import { stateLabel } from '../stateTone';
import { translationLabel, translations } from '../translations';
import { useUnitActions } from '../unitActions';

import { isSpecState, SPEC_STATES } from '@shared/state';
import { loadBearingWhitespace, whitespaceExplanation, whitespaceParts, WhitespaceReason } from '../whitespace';

import type { TransUnitDto } from '@shared/dto';
import type { WebviewSettings } from '@shared/settings';

/**
 * One trans-unit, read-only (MASTER_PLAN §11.3, §2.1, `DEC-034`).
 *
 * A **labelled box**: the legend names the translated element and carries its state, and
 * the strings inside are label/value pairs. Two unlabelled lines told apart by colour
 * asked the reader to already know which was the source.
 *
 * A description list, not a table and not a `<fieldset>`: `Original` and `[ de-DE ]` are
 * terms and the strings are their descriptions. `<legend>` belongs to form controls, so
 * the region is labelled with `aria-labelledby` instead.
 *
 * Text renders as text, never as a disabled input: a disabled field says "you could edit
 * this but may not", which is the wrong message in a viewer.
 */

const SPACE_MARK = '␣';

/** Narrow enough that a one-word caption gets a small field, wide enough to type into. */
const FIELD_MIN_COLUMNS = 24;
/** The cap the field's own width may not pass; `--field-max-inline` holds the same number. */
const FIELD_MAX_COLUMNS = 72;

const props = defineProps<{
    unit: TransUnitDto;
    settings: WebviewSettings;
    /** The active `<file>`'s target language, which labels the translation row (`DEC-034`). */
    targetLanguage?: string;
    /** The node's display name, which is the box's legend. Falls back to the id's last segment. */
    name?: string;
    /** Reconstructed by the caller when `showGeneratorNotes` is on (§4.4). */
    generatorNote?: string;
    /** Editing is on **and** allowed. Read-only renders text, never a disabled input (§11.3). */
    editing?: boolean;
}>();

const actions = useUnitActions();
const legendId = useId();
const targetId = useId();

const editing = computed(() => props.editing === true);

/**
 * How tall the field is, so a multi-line target is not typed into a one-line slot (§12.2).
 * Capped, because one unit must not take the whole viewport.
 */
const targetRows = computed(() => Math.min(8, Math.max(1, (props.unit.target ?? '').split('\n').length)));

const longestLine = (value: string) => value.split('\n').reduce((widest, line) => Math.max(widest, line.length), 0);

/**
 * Both of these are **floors**, not sizes.
 *
 * Width is `field-sizing: content`'s: the field widens with the word being written until it
 * reaches `--field-max-inline`, and only then wraps. An explicit `inline-size` would defeat
 * that, so the source's width is a minimum instead — a target that is still empty gets room
 * the size of what it has to say, and grows from there.
 *
 * Height has no cap: a translation is worth seeing whole. One line is the floor, and it is
 * what `resize: vertical` may shrink to — the floor is a line rather than the initial height
 * so a long target can be folded away when it is not the one being read.
 */
const fieldStyle = computed(() => ({
    minInlineSize: `${Math.min(FIELD_MAX_COLUMNS, Math.max(FIELD_MIN_COLUMNS, longestLine(props.unit.source)))}ch`,
    minBlockSize: 'calc(1lh + var(--field-chrome))',
}));

/**
 * Fits the field to what it now holds, on every keystroke.
 *
 * `field-sizing: content` does this on its own here, and is what sizes the width. Height is
 * the axis a translator watches while typing, so it is set rather than left to a feature
 * whose behaviour we can only confirm in one engine. `blockSize` is set to `auto` first so
 * the field can shrink back as well as grow, and the border is added because `scrollHeight`
 * counts the padding but not the border that `border-box` includes.
 */
function fitHeight(event: Event): void {
    const field = event.target as HTMLTextAreaElement;
    field.style.blockSize = 'auto';
    field.style.blockSize = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
}

/**
 * Committed on **blur**, never per keystroke.
 *
 * Every keystroke would be its own `WorkspaceEdit` and therefore its own undo step, which
 * makes Ctrl+Z unusable — the roadmap's own warning. The value is taken verbatim: a target
 * that is a single space is the translation (`DEC-021`), and trimming here would eat it.
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

const name = computed(() => props.name ?? props.unit.id.split(' - ').pop() ?? props.unit.id);
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
 * The `Developer` note with its `xx-XX=` prefix stripped (§3.7).
 *
 * Shown only where it tells the reader something new: not when the note had no prefix to
 * strip, and not when the translator has already used the suggestion — which is most of
 * the corpus, and would otherwise print the target twice under every unit.
 */
const hint = computed(() => {
    const suggestion = props.unit.developerHint;
    if (!props.settings.showDeveloperNotes || suggestion === undefined || suggestion === props.unit.target) {
        return undefined;
    }
    const raw = props.unit.notes.find(note => note.from === DEVELOPER_NOTE)?.value;
    return raw === suggestion ? undefined : suggestion;
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

/* What follows the box is outside it, and the gap says so — the same air the legend has. */
.box + * {
    margin-block-start: calc(var(--gap) / 2);
}

.unit-card.muted {
    color: var(--vscode-descriptionForeground);
}

/*
 * Sized to its contents, not to the row, in both modes. `align-self` on a column flex item
 * is fit-content, so a short string gets a short box while a long one still wraps at the
 * width the row has left rather than pushing past it. The field inside carries its own
 * width for the same reason (`fieldStyle`).
 */
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
    /* The header is a header: it needs air under it, not a line's worth of leading. */
    margin: 0 0 calc(var(--gap) / 2);
}

.legend-name {
    font-weight: 600;
    overflow-wrap: anywhere;
}

/*
 * Pushed to the end of the legend rather than sitting next to the name. An auto margin
 * rather than `space-between`, so a third thing in the legend — an edit control, say —
 * still lands beside the name instead of being centred between the two.
 */
.legend .state-badge {
    margin-inline-start: auto;
}

/*
 * Everything below the box repeats the box's own columns rather than nesting inside it, so
 * a note lines up with the string it is about. `NoteList` owns the same grid; the column is
 * a fixed token, which is what lets three separate grids agree.
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
    /* The padding and border below, which `min-block-size` and `fitHeight` allow for. */
    --field-chrome: 8px;
    /* `FIELD_MAX_COLUMNS`, which floors the same field from the other side. */
    --field-max-inline: 72ch;

    display: block;
    box-sizing: border-box;
    /* The field grows with what is typed into it, in both directions, as it is typed. */
    field-sizing: content;
    max-inline-size: min(var(--field-max-inline), 100%);
    /* Room to put the caret before the first character and after the last one. */
    padding: 3px 7px;
    border: 1px solid var(--vscode-input-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
    /* A target's own newlines are its own; the field must not add wrapping of its own. */
    white-space: pre-wrap;
    resize: vertical;
}

.state-select {
    margin-inline-start: auto;
    padding: 0 4px;
    border: 1px solid var(--vscode-input-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
    font-size: calc(var(--font) * 0.85);
}

/* No label of their own, so they start where the values do. */
.chips {
    padding-inline-start: calc(9px + var(--label-column) + var(--gap));
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

.chips {
    padding-inline: 9px;
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

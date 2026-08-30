<template>
    <div class="unit-card" :class="{ muted: !unit.translate }">
        <section class="box" :aria-labelledby="legendId">
            <p :id="legendId" class="legend">
                <span class="legend-name">{{ name }}</span>
                <StateBadge :state="unit.state" :muted="!unit.translate" />
            </p>

            <dl class="strings">
                <dt class="label">Original</dt>
                <dd class="value source">
                    <span v-if="unit.source === ''" class="absent">(empty source)</span>
                    <span v-else>{{ unit.source }}</span>
                </dd>

                <template v-for="(translation, index) in rows" :key="index">
                    <dt class="label">{{ translationLabel(translation) }}</dt>
                    <dd class="value target">
                        <span v-if="translation.value === undefined" class="absent">no target</span>
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
            <dt class="label">suggested</dt>
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
import { translationLabel, translations } from '../translations';
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

const props = defineProps<{
    unit: TransUnitDto;
    settings: WebviewSettings;
    /** The active `<file>`'s target language, which labels the translation row (`DEC-034`). */
    targetLanguage?: string;
    /** The node's display name, which is the box's legend. Falls back to the id's last segment. */
    name?: string;
    /** Reconstructed by the caller when `showGeneratorNotes` is on (§4.4). */
    generatorNote?: string;
}>();

const legendId = useId();

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
    gap: 3px;
    min-width: 0;
    padding-block: 2px;
}

.unit-card.muted {
    color: var(--vscode-descriptionForeground);
}

/*
 * Sized to its contents, not to the row. `align-self` on a column flex item is
 * fit-content, so a short string gets a short box while a long one still wraps at the
 * width the row has left rather than pushing past it.
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

/* The box's border plus its padding, so the columns continue straight through it. */
.aside,
.note-list {
    padding-inline: 9px;
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

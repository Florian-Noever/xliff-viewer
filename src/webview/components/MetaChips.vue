<template>
    <span v-if="chips.length > 0" class="meta-chips">
        <span v-for="chip in chips" :key="chip.label" class="chip" :class="{ muted: chip.muted }" :title="chip.title">
            {{ chip.label }}
        </span>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { TransUnitDto } from '@shared/dto';

/**
 * The trans-unit attributes that are not source, target or state, so that nothing the file
 * carries goes unshown.
 *
 * Each chip is only rendered when the file actually carries the attribute, so an ordinary
 * unit shows none of them and the ones that do show stand out.
 */

const props = defineProps<{ unit: TransUnitDto }>();

interface Chip {
    readonly label: string;
    readonly title: string;
    readonly muted?: boolean;
}

const chips = computed(() => {
    const unit = props.unit;
    const list: Chip[] = [];

    if (!unit.translate) {
        list.push({
            label: 'translate="no"',
            title: 'The file marks this unit as not translatable. It is excluded from every roll-up.',
            muted: true,
        });
    }
    if (unit.maxwidth !== undefined) {
        const unitName = unit.sizeUnit ?? 'unit';
        list.push({ label: `max ${unit.maxwidth} ${unitName}`, title: `maxwidth="${unit.maxwidth}" size-unit="${unitName}"` });
    }
    if (unit.alObjectTarget !== undefined) {
        list.push({ label: unit.alObjectTarget, title: `al-object-target="${unit.alObjectTarget}"` });
    }
    if (unit.declaredState !== undefined) {
        list.push({
            label: `state="${unit.declaredState}"`,
            title: `The file declares this state, but the target is ${unit.target === '' ? 'empty' : 'not what it describes'} — so the unit counts as ${unit.state}.`,
        });
    }
    if (unit.rawState !== undefined) {
        list.push({
            label: `state="${unit.rawState}"`,
            title: 'The file declares a state XLIFF 1.2 does not define, so it is shown as unknown.',
        });
    }

    return list;
});
</script>

<style scoped>
.meta-chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
}

.chip {
    padding: 0 5px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: var(--radius-sm);
    color: var(--vscode-descriptionForeground);
    font-size: calc(var(--font) * 0.85);
    white-space: nowrap;
}

.chip.muted {
    border-style: dashed;
}
</style>

import { computed } from 'vue';

import { summariseTree, summariseUnits } from '@shared/state';

import type { TransUnitDto, XliffFileDto } from '@shared/dto';
import type { StateSummary } from '@shared/state';
import type { ComputedRef } from 'vue';

/**
 * The state roll-up of the active file, by `src/shared/state.ts`. `TransUnitDto` is
 * structurally a `UnitState`, so the file's own unit index is its input.
 */

export interface Rollup {
    /** Node key → its summary. Empty until a file arrives. */
    readonly byKey: ComputedRef<ReadonlyMap<string, StateSummary>>;
    /** The whole active file, which is what the header shows. */
    readonly file: ComputedRef<StateSummary>;
}

export interface RollupSource {
    readonly file: ComputedRef<XliffFileDto | undefined>;
    readonly unitsById: ComputedRef<ReadonlyMap<string, TransUnitDto>>;
}

export function useRollup(source: RollupSource): Rollup {
    // Both are `computed`, so a re-render costs nothing and only a new document or a file
    // switch pays for the walk.
    const byKey = computed(() => summariseTree(source.file.value?.tree ?? [], source.unitsById.value));
    const file = computed(() => summariseUnits(source.file.value?.units ?? []));

    return { byKey, file };
}

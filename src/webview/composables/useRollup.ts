import { computed } from 'vue';

import { summariseTree, summariseUnits } from '@shared/state';

import type { TransUnitDto, XliffFileDto } from '@shared/dto';
import type { StateSummary } from '@shared/state';
import type { ComputedRef } from 'vue';

/**
 * The state roll-up, computed here in the webview.
 *
 * It is a thin composable on purpose. The arithmetic lives once in `src/shared/state.ts`
 * and is shared with the host; reimplementing any of it here is how the two ends start
 * disagreeing about what "86 %" means.
 *
 * `TransUnitDto` satisfies `UnitState` structurally — it carries `state` and `translate` —
 * so the DTO's own unit index is the roll-up's input with no conversion in between. That
 * is why the DTO carries `state` rather than the host shipping summaries.
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

import { computed, ref, watch } from 'vue';

import { STATE_SEVERITY } from '@shared/state';

import type { TransUnitDto } from '@shared/dto';
import type { StateSummary, XliffState } from '@shared/state';
import type { NodePredicate } from '../ancestorFilter';
import type { ComputedRef, Ref } from 'vue';

/**
 * Narrowing the tree to the states that still need work (MASTER_PLAN §11.5, §5.4).
 *
 * The chips are driven by the roll-up's own `byState`, not by a second count of the same
 * units — a chip that disagreed with the header would be worse than no chip.
 */

export interface StateChip {
    readonly state: XliffState;
    readonly count: number;
    readonly selected: boolean;
}

export interface StateFilter {
    /** Empty means "everything"; the filter is off, not set to nothing. */
    readonly selected: Ref<ReadonlySet<XliffState>>;
    readonly active: ComputedRef<boolean>;
    /** One per state present in the file, worst first. States with no units get no chip. */
    readonly chips: ComputedRef<readonly StateChip[]>;
    /** Undefined when nothing is selected, so the composition can leave the tree alone. */
    readonly predicate: ComputedRef<NodePredicate | undefined>;
    toggle(state: XliffState): void;
    clear(): void;
}

export interface StateFilterSource {
    readonly summary: ComputedRef<StateSummary>;
    readonly unitsById: ComputedRef<ReadonlyMap<string, TransUnitDto>>;
    /** Resets the selection when the document or file changes; a state may not exist there. */
    readonly scope: ComputedRef<string>;
}

export function useStateFilter(source: StateFilterSource): StateFilter {
    const selected = ref<ReadonlySet<XliffState>>(new Set());

    // Synchronous, for the same reason the tree's reseed is: a file switch must not render
    // one frame of the new file under the old file's selection.
    watch(() => source.scope.value, () => {
        selected.value = new Set();
    }, { flush: 'sync' });

    const active = computed(() => selected.value.size > 0);

    const chips = computed<readonly StateChip[]>(() => STATE_SEVERITY
        .map(state => ({ state, count: source.summary.value.byState[state] ?? 0, selected: selected.value.has(state) }))
        .filter(chip => chip.count > 0));

    const predicate = computed<NodePredicate | undefined>(() => {
        if (!active.value) {
            return undefined;
        }
        const states = selected.value;
        const units = source.unitsById.value;
        // Only a node carrying a unit can have a state; containers ride in as ancestors.
        return (node) => {
            const unit = units.get(node.key);
            return unit !== undefined && states.has(unit.state);
        };
    });

    function toggle(state: XliffState): void {
        const next = new Set(selected.value);
        if (!next.delete(state)) {
            next.add(state);
        }
        selected.value = next;
    }

    function clear(): void {
        selected.value = new Set();
    }

    return { selected, active, chips, predicate, toggle, clear };
}

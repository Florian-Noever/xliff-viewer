import { computed } from 'vue';

import { hintsFor } from '../validation';

import type { AlNodeDto, TransUnitDto, XliffFileDto } from '@shared/dto';
import type { WebviewSettings } from '@shared/settings';
import type { Hint, HintOptions } from '../validation';
import type { ComputedRef, Ref } from 'vue';

/**
 * The validation hints, per unit and rolled up the tree.
 *
 * Both maps are `computed`, so a keystroke costs nothing: they are rebuilt when the file,
 * its units or the two validation settings change, and not otherwise. That matters — an
 * edit patches one unit yet recomputes the whole document's hints, which must happen once
 * per change rather than once per render.
 *
 * The roll-up counts **units carrying at least one hint**, not hints: a container saying
 * "3" should mean three translations to look at, not one translation with three problems.
 */

export interface Validation {
    /** Unit id → its hints. A unit with none is absent rather than mapped to `[]`. */
    readonly byUnit: ComputedRef<ReadonlyMap<string, readonly Hint[]>>;
    /** Node key → how many units beneath it carry a hint. Absent where none do. */
    readonly countByKey: ComputedRef<ReadonlyMap<string, number>>;
}

export interface ValidationSource {
    readonly file: ComputedRef<XliffFileDto | undefined>;
    readonly settings: Readonly<Ref<WebviewSettings>>;
}

export function useValidation(source: ValidationSource): Validation {
    const byUnit = computed(() => {
        const settings = source.settings.value;
        const file = source.file.value;
        if (!settings.validationEnabled || file === undefined) {
            return new Map<string, readonly Hint[]>();
        }
        return collect(file.units, {
            sourceLanguage: file.sourceLanguage,
            targetLanguage: file.targetLanguage,
            sameAsSource: settings.validationSameAsSource,
        });
    });

    const countByKey = computed(() => {
        const counts = new Map<string, number>();
        for (const node of source.file.value?.tree ?? []) {
            countNode(node, byUnit.value, counts);
        }
        return counts;
    });

    return { byUnit, countByKey };
}

function collect(units: readonly TransUnitDto[], options: HintOptions): ReadonlyMap<string, readonly Hint[]> {
    const byUnit = new Map<string, readonly Hint[]>();
    for (const unit of units) {
        const hints = hintsFor(unit, options);
        if (hints.length > 0) {
            byUnit.set(unit.id, hints);
        }
    }
    return byUnit;
}

/**
 * A node carries a unit exactly when its key is that unit's id, so a leaf is
 * counted by looking itself up — the same identity `summariseTree` walks on.
 */
function countNode(node: AlNodeDto, byUnit: ReadonlyMap<string, readonly Hint[]>, counts: Map<string, number>): number {
    let total = byUnit.has(node.key) ? 1 : 0;
    for (const child of node.children) {
        total += countNode(child, byUnit, counts);
    }
    if (total > 0) {
        counts.set(node.key, total);
    }
    return total;
}

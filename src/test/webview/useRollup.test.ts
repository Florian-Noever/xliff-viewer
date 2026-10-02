import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';

import { useRollup } from '../../webview/composables/useRollup';
import { summariseUnits, XliffState } from '../../shared/state';
import { fileDto, nodeDto, unitDto } from '../support/dtoBuilders';
import { withSetup } from './support/withSetup';

import type { XliffFileDto } from '../../shared/dto';
import type { Rollup } from '../../webview/composables/useRollup';

describe('useRollup', () => {
    const tree = [
        nodeDto('Table 1', [nodeDto('Table 1 - Property 2'), nodeDto('Table 1 - Property 3')], { name: 'Customer' }),
        nodeDto('Table 4', [nodeDto('Table 4 - Property 5')], { name: 'Vendor' }),
    ];

    const units = [
        unitDto('Table 1 - Property 2', { state: XliffState.translated }),
        unitDto('Table 1 - Property 3', { state: XliffState.empty }),
        unitDto('Table 4 - Property 5', { state: XliffState.translated }),
    ];

    function rollupOf(file: XliffFileDto | undefined): Rollup {
        const active = ref(file);
        return withSetup(() => useRollup({
            file: computed(() => active.value),
            unitsById: computed(() => new Map((active.value?.units ?? []).map(each => [each.id, each]))),
        })).result;
    }

    const file = fileDto({ tree, units });

    it('summarises every node by key', () => {
        const rollup = rollupOf(file);

        expect([...rollup.byKey.value.keys()].sort()).toEqual([
            'Table 1',
            'Table 1 - Property 2',
            'Table 1 - Property 3',
            'Table 4',
            'Table 4 - Property 5',
        ]);
    });

    it('rolls the worst descendant up to its container', () => {
        const rollup = rollupOf(file);

        expect(rollup.byKey.value.get('Table 1')?.worst).toBe(XliffState.empty);
        expect(rollup.byKey.value.get('Table 1')?.percent).toBe(50);
        expect(rollup.byKey.value.get('Table 4')?.worst).toBe(XliffState.translated);
        expect(rollup.byKey.value.get('Table 4')?.percent).toBe(100);
    });

    it('summarises the whole file for the header', () => {
        const rollup = rollupOf(file);

        expect(rollup.file.value.total).toBe(3);
        expect(rollup.file.value.translatedCount).toBe(2);
        expect(rollup.file.value.percent).toBe(67);
    });

    it('feeds the DTO straight in — TransUnitDto is already a UnitState', () => {
        // If this ever needs a conversion step, the DTO has drifted from the roll-up.
        expect(summariseUnits(units)).toEqual(rollupOf(file).file.value);
    });

    it('is empty, not undefined, before a file arrives', () => {
        const rollup = rollupOf(undefined);

        expect(rollup.byKey.value.size).toBe(0);
        expect(rollup.file.value.total).toBe(0);
        expect(rollup.file.value.worst).toBeUndefined();
    });
});

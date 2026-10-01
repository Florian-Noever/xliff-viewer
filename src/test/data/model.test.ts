import { describe, expect, it } from 'vitest';

import { iterateUnits } from '../../shared/model';
import { document, file, group, unit } from '../support/modelBuilders';

describe('iterateUnits', () => {
    it('walks units in file order through nested groups', () => {
        const doc = document([file([unit('body-1')], [group([unit('outer-1')], [group([unit('inner-1')])])])]);

        expect([...iterateUnits(doc)].map(u => u.id)).toEqual(['body-1', 'outer-1', 'inner-1']);
    });

    it('walks every file, not just the first', () => {
        const doc = document([file([unit('a')]), file([unit('b')])]);

        expect([...iterateUnits(doc)].map(u => u.id)).toEqual(['a', 'b']);
    });

    it('yields nothing for an empty body', () => {
        const doc = document([file([])]);
        expect([...iterateUnits(doc)]).toEqual([]);
    });
});

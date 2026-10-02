import { describe, expect, it } from 'vitest';

import { indexNodes, reconstructGeneratorNote } from '../../webview/generatorNote';
import { groupKey } from '../support/dtoBuilders';

import type { AlNodeDto } from '../../shared/dto';

describe('reconstructGeneratorNote', () => {
    const tree: AlNodeDto[] = [{
        key: 'Table 1',
        type: 'Table',
        name: 'PTE Contoso Methods Setup',
        children: [{
            key: 'Table 1 - Field 2',
            type: 'Field',
            name: 'Contoso Method',
            children: [{ key: 'Table 1 - Field 2 - Property 3', type: 'Property', name: 'Caption', children: [] }],
        }],
    }];

    it('rebuilds the note the payload does not carry', () => {
        const note = reconstructGeneratorNote('Table 1 - Field 2 - Property 3', indexNodes(tree));

        expect(note).toBe('Table PTE Contoso Methods Setup - Field Contoso Method - Property Caption');
    });

    it('gives up rather than guessing when a name could not be parsed', () => {
        const unnamed: AlNodeDto[] = [{ key: 'Table 1', type: 'Table', children: [] }];

        expect(reconstructGeneratorNote('Table 1', indexNodes(unnamed))).toBeUndefined();
    });

    it('gives up on an id that is not in the tree', () => {
        expect(reconstructGeneratorNote('Table 9', indexNodes(tree))).toBeUndefined();
    });

    it('starts with the namespace and skips the levels the tree adds', () => {
        const id = 'Namespace Contoso.Sales - Report "Contoso Sales - Quote" - Property Caption';
        const namespaced: AlNodeDto[] = [{
            key: 'Namespace 1',
            type: 'Namespace',
            name: 'Contoso.Sales',
            children: [{
                key: groupKey('Report', 'Namespace 1'),
                type: 'Report',
                name: 'Reports (1)',
                group: true,
                children: [{
                    key: 'Namespace 1 - Report 2',
                    type: 'Report',
                    name: 'Contoso Sales - Quote',
                    children: [{ key: id, type: 'Property', name: 'Caption', children: [] }],
                }],
            }],
        }];

        expect(reconstructGeneratorNote(id, indexNodes(namespaced))).toBe('Namespace Contoso.Sales - Report Contoso Sales - Quote - Property Caption');
    });
});

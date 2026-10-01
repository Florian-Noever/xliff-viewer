import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BaseFileIndex, compareToBase } from '../../extension/services/baseFileIndex';
import { flushLogs, setVirtualFile, watcherCount } from '../__mocks__/vscode';

/**
 * The comparison is exact string equality on source, never trimmed — a trailing space is
 * a change, because `xml:space="preserve"` makes it one.
 */

const BASE = vscode.Uri.file('/w/App.g.xlf');

const document = (units: [string, string][]): string => [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<xliff version="1.2"><file source-language="en-US" target-language="en-US"><body>',
    ...units.map(([id, source]) => `<trans-unit id="${id}"><source>${source}</source></trans-unit>`),
    '</body></file></xliff>',
].join('\n');

const unit = (id: string, source: string) => ({ id, source });

let index: BaseFileIndex;

beforeEach(() => {
    index = new BaseFileIndex();
});

afterEach(() => {
    index.dispose();
});

describe('BaseFileIndex', () => {
    it('reads the base file into an id → source map', async () => {
        setVirtualFile('/w/App.g.xlf', document([['Table 1 - Property 2', 'Customer'], ['Table 1 - Property 3', 'Vendor']]));

        const sources = await index.sourcesOf(BASE);

        expect(sources.size).toBe(2);
        expect(sources.get('Table 1 - Property 2')).toBe('Customer');
    });

    it('parses once and answers from cache after that', async () => {
        setVirtualFile('/w/App.g.xlf', document([['a', 'A']]));

        await index.sourcesOf(BASE);
        const first = flushLogs();
        await index.sourcesOf(BASE);

        expect(first.filter(line => line.includes('Indexed'))).toHaveLength(1);
        expect(flushLogs().filter(line => line.includes('Indexed'))).toHaveLength(0);
    });

    it('re-reads a base file it is told changed, and says which', async () => {
        setVirtualFile('/w/App.g.xlf', document([['a', 'A']]));
        await index.sourcesOf(BASE);
        const told: string[] = [];
        index.onDidChange(uri => told.push(uri.path));

        setVirtualFile('/w/App.g.xlf', document([['a', 'A'], ['b', 'B']]));
        index.forget(BASE);

        expect(told).toEqual(['/w/App.g.xlf']);
        expect((await index.sourcesOf(BASE)).size).toBe(2);
    });

    it('is empty rather than an error when the file cannot be read', async () => {
        const sources = await index.sourcesOf(BASE);

        expect(sources.size).toBe(0);
        expect(flushLogs().some(line => line.startsWith('error'))).toBe(false);
    });

    it('is empty rather than an error when the base file is mid-write and will not parse', async () => {
        // Somebody else's artefact: the AL compiler may be halfway through writing it.
        setVirtualFile('/w/App.g.xlf', '<xliff version="1.2"><file>');

        expect((await index.sourcesOf(BASE)).size).toBe(0);
        expect(flushLogs().some(line => line.includes('Could not index'))).toBe(true);
    });

    it('watches nothing itself, and tells no one once disposed', () => {
        const told: string[] = [];
        index.onDidChange(uri => told.push(uri.path));

        index.dispose();
        index.forget(BASE);

        expect(watcherCount()).toBe(0);
        expect(told).toEqual([]);
    });
});

describe('compareToBase', () => {
    const base = new Map([['a', 'Customer'], ['b', 'Vendor']]);

    it('says nothing when the two agree — the common case', () => {
        expect(compareToBase([unit('a', 'Customer'), unit('b', 'Vendor')], base)).toEqual([]);
    });

    it('marks a unit the base no longer has as orphaned', () => {
        expect(compareToBase([unit('gone', 'Old')], base)).toEqual([{ id: 'gone', orphaned: true }]);
    });

    it('marks a changed source and carries the base text with it', () => {
        expect(compareToBase([unit('a', 'Client')], base)).toEqual([{ id: 'a', baseSource: 'Customer' }]);
    });

    it('treats a trailing space as a change, because xml:space says it is one', () => {
        expect(compareToBase([unit('a', 'Customer ')], base)).toEqual([{ id: 'a', baseSource: 'Customer' }]);
    });

    it('treats a leading space the same way', () => {
        expect(compareToBase([unit('a', ' Customer')], base)).toEqual([{ id: 'a', baseSource: 'Customer' }]);
    });

    it('is case-sensitive, since a case change is a source change', () => {
        expect(compareToBase([unit('a', 'customer')], base)).toEqual([{ id: 'a', baseSource: 'Customer' }]);
    });

    it('returns only what differs, so an in-step file costs nothing to report', () => {
        const units = [unit('a', 'Customer'), unit('b', 'Changed'), unit('c', 'New')];

        expect(compareToBase(units, base)).toEqual([
            { id: 'b', baseSource: 'Vendor' },
            { id: 'c', orphaned: true },
        ]);
    });

    it('marks everything orphaned against an empty base rather than crashing', () => {
        expect(compareToBase([unit('a', 'A')], new Map())).toEqual([{ id: 'a', orphaned: true }]);
    });
});

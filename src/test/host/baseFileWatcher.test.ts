import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BaseFileWatcher } from '../../extension/services/baseFileWatcher';
import { fireFileWatcher, watcherCount } from '../__mocks__/vscode';

let watcher: BaseFileWatcher;
let told: string[];

beforeEach(() => {
    watcher = new BaseFileWatcher();
    told = [];
    watcher.onDidChange(uri => told.push(uri.path));
});

afterEach(() => {
    watcher.dispose();
});

describe('BaseFileWatcher', () => {
    it('says which base file appeared, changed or went away', () => {
        fireFileWatcher('created', '/w/T/App.g.xlf');
        fireFileWatcher('changed', '/w/T/App.g.xlf');
        fireFileWatcher('deleted', '/w/Other/Other.g.xlf');

        expect(told).toEqual(['/w/T/App.g.xlf', '/w/T/App.g.xlf', '/w/Other/Other.g.xlf']);
    });

    it('says nothing about a file that is not a base file', () => {
        fireFileWatcher('changed', '/w/T/App.de-DE.xlf');
        fireFileWatcher('changed', '/w/src/Order.Table.al');

        expect(told).toEqual([]);
    });

    it('is one watcher, gone once disposed', () => {
        expect(watcherCount()).toBe(1);

        watcher.dispose();
        fireFileWatcher('changed', '/w/T/App.g.xlf');

        expect(watcherCount()).toBe(0);
        expect(told).toEqual([]);
    });
});

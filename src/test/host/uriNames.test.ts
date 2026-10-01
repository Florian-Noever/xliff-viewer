import * as vscode from 'vscode';
import { describe, expect, it } from 'vitest';

import { appNameOf, fileNameOf } from '../../extension/services/uriNames';

const uri = (path: string): vscode.Uri => vscode.Uri.file(path);

describe('appNameOf', () => {
    it('strips the language segment', () => {
        expect(appNameOf(uri('/w/Contoso Base App.de-DE.xlf'))).toBe('Contoso Base App');
    });

    it('keeps a stem that has no language segment', () => {
        expect(appNameOf(uri('/w/App.xlf'))).toBe('App');
    });

    it('keeps the dots inside an app name', () => {
        expect(appNameOf(uri('/w/Contoso.Sales.App.de-DE.xlf'))).toBe('Contoso.Sales.App');
    });
});

describe('fileNameOf', () => {
    it('takes the file name off a URI, whatever the folder is called', () => {
        expect(fileNameOf(uri('/w/Translations/Contoso Base App.de-DE.xlf'))).toBe('Contoso Base App.de-DE.xlf');
        expect(fileNameOf(uri('/App.g.xlf'))).toBe('App.g.xlf');
    });
});

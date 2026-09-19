import * as vscode from 'vscode';

import { DEFAULT_STATE_ON_EDIT, DEFAULT_WEBVIEW_SETTINGS, SETTINGS_SECTION, SettingKey } from '../../shared/settings';
import { isSpecState } from '../../shared/state';

import type { WebviewSettings } from '../../shared/settings';
import type { XliffState } from '../../shared/state';

/**
 * The only place that reads this extension's configuration.
 *
 * Nothing else reads an `xliffViewer.*` key: a setting read in two places is a setting
 * that will be defaulted differently in two places.
 *
 * Every read is defensive. `package.json` declares defaults and types, but a user can put
 * a string where a number belongs, and VS Code hands it over unchanged.
 */

export interface XliffViewerSettings extends WebviewSettings {
    /** Empty when unset — an absolute or workspace-relative path, or a glob. */
    readonly baseFile: string;
    /** Applied when a target is edited without an explicit state. */
    readonly stateOnEdit: XliffState;
}

/** Pass the document's URI so folder-level settings win over workspace ones. */
export function readSettings(scope?: vscode.ConfigurationScope): XliffViewerSettings {
    const configuration = vscode.workspace.getConfiguration(SETTINGS_SECTION, scope);

    return {
        baseFile: readString(configuration, SettingKey.baseFile, ''),
        editMode: readBoolean(configuration, SettingKey.editMode, DEFAULT_WEBVIEW_SETTINGS.editMode),
        stateOnEdit: readStateOnEdit(configuration),
        showDeveloperNotes: readBoolean(configuration, SettingKey.showDeveloperNotes, DEFAULT_WEBVIEW_SETTINGS.showDeveloperNotes),
        showGeneratorNotes: readBoolean(configuration, SettingKey.showGeneratorNotes, DEFAULT_WEBVIEW_SETTINGS.showGeneratorNotes),
        defaultExpandDepth: readDepth(configuration),
        validationEnabled: readBoolean(configuration, SettingKey.validationEnabled, DEFAULT_WEBVIEW_SETTINGS.validationEnabled),
        validationSameAsSource: readBoolean(configuration, SettingKey.validationSameAsSource, DEFAULT_WEBVIEW_SETTINGS.validationSameAsSource),
    };
}

/** The slice the webview is told about — `baseFile` and `stateOnEdit` stay in the host. */
export function toWebviewSettings(settings: XliffViewerSettings): WebviewSettings {
    return {
        editMode: settings.editMode,
        showDeveloperNotes: settings.showDeveloperNotes,
        showGeneratorNotes: settings.showGeneratorNotes,
        defaultExpandDepth: settings.defaultExpandDepth,
        validationEnabled: settings.validationEnabled,
        validationSameAsSource: settings.validationSameAsSource,
    };
}

/** True when a configuration change touched anything we read. */
export function affectsSettings(event: vscode.ConfigurationChangeEvent, scope?: vscode.ConfigurationScope): boolean {
    return event.affectsConfiguration(SETTINGS_SECTION, scope);
}

function readString(configuration: vscode.WorkspaceConfiguration, key: SettingKey, fallback: string): string {
    const value: unknown = configuration.get(key);
    return typeof value === 'string' ? value : fallback;
}

function readBoolean(configuration: vscode.WorkspaceConfiguration, key: SettingKey, fallback: boolean): boolean {
    const value: unknown = configuration.get(key);
    return typeof value === 'boolean' ? value : fallback;
}

/** Non-negative and whole: a fractional or negative depth would silently expand nothing. */
function readDepth(configuration: vscode.WorkspaceConfiguration): number {
    const value: unknown = configuration.get(SettingKey.defaultExpandDepth);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_WEBVIEW_SETTINGS.defaultExpandDepth;
    }
    return Math.max(0, Math.floor(value));
}

/** Only the ten states the spec allows in a file — never a synthetic one. */
function readStateOnEdit(configuration: vscode.WorkspaceConfiguration): XliffState {
    const value: unknown = configuration.get(SettingKey.stateOnEdit);
    return isSpecState(value) ? value : DEFAULT_STATE_ON_EDIT;
}

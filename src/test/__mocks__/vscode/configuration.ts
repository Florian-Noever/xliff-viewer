/** Settings, the user's and the workspace's, and whether the workspace is trusted. */

import { Disposable } from './events';

export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string, scope?: unknown): boolean;
}

let workspaceValues: Record<string, unknown> = {};
let userValues: Record<string, unknown> = {};
let configurationListeners: ((event: ConfigurationChangeEvent) => void)[] = [];
let workspaceTrusted = true;
let trustListeners: (() => void)[] = [];
let configurationScopes: { section?: string; scope?: unknown }[] = [];

/** The workspace's value wins over the user's, as it does in the editor. */
export function getConfiguration(section?: string, scope?: unknown) {
    configurationScopes.push({ section, scope });
    const qualified = (key: string): string => (section === undefined ? key : `${section}.${key}`);
    return {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            const full = qualified(key);
            if (full in workspaceValues) {
                return workspaceValues[full] as T;
            }
            if (full in userValues) {
                return userValues[full] as T;
            }
            return defaultValue;
        },
        inspect: <T>(key: string): { key: string; globalValue?: T; workspaceValue?: T } => {
            const full = qualified(key);
            return { key: full, globalValue: userValues[full] as T | undefined, workspaceValue: workspaceValues[full] as T | undefined };
        },
    };
}

export function onDidChangeConfiguration(listener: (event: ConfigurationChangeEvent) => void): Disposable {
    configurationListeners.push(listener);
    return new Disposable(() => {
        const index = configurationListeners.indexOf(listener);
        if (index >= 0) {
            configurationListeners.splice(index, 1);
        }
    });
}

export function isTrusted(): boolean {
    return workspaceTrusted;
}

export function onDidGrantWorkspaceTrust(listener: () => void): Disposable {
    trustListeners.push(listener);
    return new Disposable(() => {
        trustListeners = trustListeners.filter(each => each !== listener);
    });
}

// ── arrange ──────────────────────────────────────────────────────────────────
/** A workspace value, by its fully qualified `section.key`. */
export function setConfigOverride(key: string, value: unknown): void {
    workspaceValues[key] = value;
}

/** A value from the user's own settings, which Restricted Mode still honours. */
export function setUserConfigOverride(key: string, value: unknown): void {
    userValues[key] = value;
}

/** Restricted Mode when false. Granting trust tells the listeners, as the editor does. */
export function setWorkspaceTrusted(trusted: boolean): void {
    const granted = trusted && !workspaceTrusted;
    workspaceTrusted = trusted;
    if (granted) {
        for (const listener of [...trustListeners]) {
            listener();
        }
    }
}

/** A change to these settings: `affectsConfiguration` is true for each, and for every section that holds one. */
export function configurationChange(...sections: string[]): ConfigurationChangeEvent {
    return {
        affectsConfiguration: (section: string) => sections.some(changed => changed === section || changed.startsWith(`${section}.`)),
    };
}

/** Fires `onDidChangeConfiguration` with a `configurationChange` of these settings. */
export function fireConfigurationChange(...sections: string[]): void {
    const event = configurationChange(...sections);
    for (const listener of [...configurationListeners]) {
        listener(event);
    }
}

// ── assert ───────────────────────────────────────────────────────────────────
/** Which section, and for which scope, each `getConfiguration` call asked. */
export function flushConfigurationScopes(): { section?: string; scope?: unknown }[] {
    return configurationScopes.splice(0);
}

/** How many listeners `onDidChangeConfiguration` currently has — a disposal spy. */
export function configurationListenerCount(): number {
    return configurationListeners.length;
}

export function resetConfiguration(): void {
    workspaceValues = {};
    userValues = {};
    configurationListeners = [];
    workspaceTrusted = true;
    trustListeners = [];
    configurationScopes = [];
}

import * as vscode from 'vscode';

import { Logger } from './logger';

/**
 * Where each AL object is declared (MASTER_PLAN §10.1).
 *
 * **A targeted text search, never an AL parser** (§17). The question is only "which file
 * declares `Table "PTE Contoso Methods Setup"`", and a line-oriented scan answers it for
 * every AL file ever written without carrying a grammar.
 *
 * Built lazily and cached per workspace, because it depends on the user's workspace
 * containing the app source and most of the time it will not be asked for at all.
 */

const AL_GLOB = '**/*.al';

/**
 * The AL object kinds that can start a declaration. A closed set, unlike the id's segment
 * types (§4.2) — this is the language's grammar, not our data. Adding one is one line.
 */
const OBJECT_KINDS = [
    'table', 'tableextension', 'page', 'pageextension', 'report', 'reportextension',
    'codeunit', 'xmlport', 'enum', 'enumextension', 'query', 'profile', 'permissionset',
    'permissionsetextension', 'interface', 'controladdin', 'pagecustomization', 'entitlement',
    'dotnet', 'reportlayout',
];

/** `table 50100 "PTE Contoso Methods Setup"` — the id is optional, the name may be bare. */
const DECLARATION = new RegExp(
    `^\\s{0,4}(${OBJECT_KINDS.join('|')})\\s+(?:\\d+\\s+)?(?:"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*))`,
    'i',
);

/** Keywords that make a line the *declaration* of a member rather than a use of one. */
const MEMBER_KEYWORDS = /\b(field|control|action|dataitem|value|group|part|procedure|trigger|column|label)\b/i;

export interface AlDeclaration {
    readonly uri: vscode.Uri;
    /** Zero-based. */
    readonly line: number;
    readonly kind: string;
    readonly name: string;
}

export class AlObjectIndex implements vscode.Disposable {
    private index: Promise<ReadonlyMap<string, AlDeclaration[]>> | undefined;
    private readonly subscriptions: vscode.Disposable[] = [];

    public constructor() {
        const watcher = vscode.workspace.createFileSystemWatcher(AL_GLOB);
        this.subscriptions.push(
            watcher,
            watcher.onDidCreate(() => this.invalidate()),
            watcher.onDidChange(() => this.invalidate()),
            watcher.onDidDelete(() => this.invalidate()),
        );
    }

    public invalidate(): void {
        this.index = undefined;
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions.length = 0;
        this.index = undefined;
    }

    /** Whether the workspace has any AL source at all — what disables the button (§10.1). */
    public async hasAlFiles(): Promise<boolean> {
        try {
            return (await vscode.workspace.findFiles(AL_GLOB, undefined, 1)).length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Every declaration of `<kind> <name>`, case-insensitive on both but **exact on the
     * name** — a fuzzy match must never be opened silently (§10.1).
     */
    public async find(kind: string, name: string): Promise<readonly AlDeclaration[]> {
        this.index ??= this.build();
        return (await this.index).get(keyOf(kind, name)) ?? [];
    }

    private async build(): Promise<ReadonlyMap<string, AlDeclaration[]>> {
        // A workspace with thousands of AL files takes visible time to walk, and this runs
        // on a click. Window-location progress says so without stealing focus.
        const declarations = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: 'Indexing AL objects…' },
            () => collectDeclarations(),
        );
        return declarations;
    }
}

async function collectDeclarations(): Promise<ReadonlyMap<string, AlDeclaration[]>> {
    const started = Date.now();
    const declarations = new Map<string, AlDeclaration[]>();

    let files: vscode.Uri[];
    try {
        // `findFiles` honours the workspace's own excludes, so files the user hid stay hidden.
        files = await vscode.workspace.findFiles(AL_GLOB);
    } catch (error: unknown) {
        Logger.warn(`Could not list AL files: ${error instanceof Error ? error.message : 'unknown error'}`);
        return declarations;
    }

    for (const uri of files) {
        for (const declaration of await declarationsIn(uri)) {
            const key = keyOf(declaration.kind, declaration.name);
            const existing = declarations.get(key);
            if (existing === undefined) {
                declarations.set(key, [declaration]);
            } else {
                existing.push(declaration);
            }
        }
    }

    Logger.info(`Indexed ${declarations.size} AL object declarations in ${files.length} files (${Date.now() - started} ms).`);
    return declarations;
}

function keyOf(kind: string, name: string): string {
    return `${kind.toLowerCase()} ${name.toLowerCase()}`;
}

async function declarationsIn(uri: vscode.Uri): Promise<AlDeclaration[]> {
    let lines: string[];
    try {
        lines = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)).split('\n');
    } catch {
        return [];
    }

    const found: AlDeclaration[] = [];
    lines.forEach((text, line) => {
        const match = DECLARATION.exec(text);
        if (match !== null) {
            found.push({ uri, line, kind: match[1], name: match[2] ?? match[3] });
        }
    });
    return found;
}

/**
 * Where a member is declared inside a file it belongs to, or undefined.
 *
 * Deliberately shallow: a line that both declares something and carries the name is good
 * enough, and the first plausible match wins (§10.1's own out-of-scope note). Getting this
 * exactly right needs the AL parser §17 refuses to write.
 */
export function findMemberLine(text: string, memberName: string): number | undefined {
    const quoted = escapeRegex(memberName);
    const named = new RegExp(`(?:"${quoted}"|\\b${quoted}\\b)`, 'i');
    const lines = text.split('\n');

    const declaring = lines.findIndex(line => named.test(line) && MEMBER_KEYWORDS.test(line));
    if (declaring >= 0) {
        return declaring;
    }

    const anywhere = lines.findIndex(line => named.test(line));
    return anywhere < 0 ? undefined : anywhere;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

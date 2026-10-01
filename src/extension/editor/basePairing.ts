import { compareToBase } from '../services/baseFileIndex';
import { Logger } from '../services/logger';
import { fileNameOf } from '../services/uriNames';
import { ExtensionMessageType } from '../../shared/messages';

import type * as vscode from 'vscode';
import type { XliffDocumentSession } from './documentSession';
import type { BaseFileIndex } from '../services/baseFileIndex';
import type { BaseFileResolver } from '../services/baseFileResolver';
import type { XliffDocumentDto } from '../../shared/dto';
import type { ExtensionMessage } from '../../shared/messages';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * One panel's pairing of a document with its base file: which base file it is, and which
 * units the base file no longer agrees with.
 */
export class BasePairing implements vscode.Disposable {
    private readonly session: XliffDocumentSession;
    private readonly post: (message: ExtensionMessage) => void;
    private readonly baseFiles: BaseFileResolver;
    private readonly baseIndex: BaseFileIndex | undefined;
    private readonly subscription: vscode.Disposable | undefined;
    /**
     * Which units this panel has been told are orphaned or source-changed, per `<file>`.
     * `patchUnits` can only *set* a marker; clearing one means sending the unit again
     * without it, which needs knowing what was sent.
     */
    private readonly marked = new Map<number, ReadonlySet<string>>();

    public constructor(
        session: XliffDocumentSession,
        post: (message: ExtensionMessage) => void,
        baseFiles: BaseFileResolver,
        baseIndex: BaseFileIndex | undefined,
    ) {
        this.session = session;
        this.post = post;
        this.baseFiles = baseFiles;
        this.baseIndex = baseIndex;

        // The base file is somebody else's artefact: the AL compiler rewrites it while this
        // document stays untouched, and the markers on screen were computed from the old one.
        // The resolver clears its own cache from the same watcher event, and it is constructed
        // first, so by the time this runs both caches are already cold.
        this.subscription = baseIndex?.onDidChange(() => {
            const state = session.current();
            if (state.kind === 'document') {
                this.announce(state.dto);
            }
        });
    }

    /** Posts the base file, then the markers, once resolution finishes. Never awaited: the document must not wait for it. */
    public announce(dto: XliffDocumentDto): void {
        void this.announceBaseFile(dto);
    }

    public dispose(): void {
        this.subscription?.dispose();
    }

    /** Posts `baseFile` once resolution finishes. Not finding one is a result, not a failure. */
    private async announceBaseFile(dto: XliffDocumentDto): Promise<void> {
        let resolved;
        try {
            resolved = await this.baseFiles.resolve(this.session.uri, dto.isBaseFile);
        } catch (error: unknown) {
            Logger.warn(`Base-file resolution failed for ${this.session.uri.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
            this.post({ type: ExtensionMessageType.baseFile, payload: null });
            return;
        }

        this.post({
            type: ExtensionMessageType.baseFile,
            payload: resolved.uri === undefined
                ? null
                : { uri: resolved.uri.toString(), fileName: fileNameOf(resolved.uri) },
        });

        // No base file is an answer too: whatever was marked against the old one is no longer
        // something we can claim, so the markers come off.
        const sources = resolved.uri === undefined || this.baseIndex === undefined
            ? new Map<string, string>()
            : await this.baseIndex.sourcesOf(resolved.uri);

        this.announceStaleUnits(sources, dto);
    }

    /**
     * Marks the units the base file no longer agrees with, and unmarks the ones it now does.
     *
     * Sent as `patchUnits` rather than a fresh `setDocument`: a language file in step with its
     * base produces nothing at all, and one that has drifted produces only the units that
     * drifted.
     *
     * An **empty** `sources` map means there is nothing to compare against — no base file, or
     * one that could not be read. That unmarks rather than freezing what was marked before:
     * `compareToBase` against nothing would call every unit orphaned, which is the one wrong
     * answer worth guarding against.
     */
    private announceStaleUnits(sources: ReadonlyMap<string, string>, dto: XliffDocumentDto): void {
        for (const file of dto.files) {
            const differences = sources.size === 0 ? [] : compareToBase(file.units, sources);
            const byId = new Map(file.units.map(unit => [unit.id, unit]));

            const nowMarked = new Set(differences.map(difference => difference.id));
            const previously = this.marked.get(file.index) ?? EMPTY;
            this.marked.set(file.index, nowMarked);

            const set = differences.flatMap((difference) => {
                const unit = byId.get(difference.id);
                return unit === undefined ? [] : [{ ...unit, orphaned: difference.orphaned, baseSource: difference.baseSource }];
            });
            // The DTO's own unit carries no markers, so sending it again is how one comes off.
            const cleared = [...previously]
                .filter(id => !nowMarked.has(id))
                .flatMap((id) => {
                    const unit = byId.get(id);
                    return unit === undefined ? [] : [unit];
                });

            if (set.length === 0 && cleared.length === 0) {
                continue;
            }

            Logger.info(`<file> ${file.index}: ${set.length} of ${file.units.length} units differ from the base file, ${cleared.length} no longer do.`);
            this.post({ type: ExtensionMessageType.patchUnits, payload: { fileIndex: file.index, units: [...set, ...cleared] } });
        }
    }
}

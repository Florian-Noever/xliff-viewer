import { compareToBase } from '../services/baseFileIndex';
import { Logger } from '../services/logger';
import { fileNameOf } from '../services/uriNames';
import { ExtensionMessageType } from '../../shared/messages';

import type * as vscode from 'vscode';
import type { XliffDocumentSession } from './documentSession';
import type { BaseFileIndex, UnitComparison } from '../services/baseFileIndex';
import type { BaseFileResolver } from '../services/baseFileResolver';
import type { TransUnitDto, XliffDocumentDto } from '../../shared/dto';
import type { ExtensionMessage } from '../../shared/messages';

/** What a unit carries when the base file disagrees with it. */
type Markers = Omit<UnitComparison, 'id'>;

const NO_MARKERS: ReadonlyMap<string, Markers> = new Map();

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
     * The markers this panel has been sent, per `<file>` and unit. `patchUnits` can only
     * *set* a marker; clearing one means sending the unit again without it, and any unit sent
     * for another reason has to carry its markers along.
     */
    private readonly marked = new Map<number, ReadonlyMap<string, Markers>>();
    /** Counts announcements, so one that a newer one overtook posts nothing. */
    private runs = 0;
    private disposed = false;

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
        this.subscription = baseIndex?.onDidChange(() => {
            this.announce();
        });
    }

    /**
     * Posts the base file, then the markers, once resolution finishes. Never awaited: the
     * document must not wait for it. Only the latest announcement posts anything.
     */
    public announce(): void {
        const run = ++this.runs;
        void this.announceBaseFile(() => run === this.runs && !this.disposed);
    }

    /** The unit as this panel shows it: with the markers it was last sent, if any. */
    public withMarkers(fileIndex: number, unit: TransUnitDto): TransUnitDto {
        return { ...unit, ...this.marked.get(fileIndex)?.get(unit.id) };
    }

    public dispose(): void {
        this.disposed = true;
        this.subscription?.dispose();
    }

    /**
     * Posts `baseFile` once resolution finishes. Not finding one is a result, not a failure.
     *
     * Reads the document from the session after each wait rather than holding on to it: an
     * edit can land in the meantime, and markers built from an older payload would put its
     * old target back on screen.
     */
    private async announceBaseFile(isCurrent: () => boolean): Promise<void> {
        const state = this.session.current();
        if (state.kind !== 'document') {
            return;
        }

        let resolved;
        try {
            resolved = await this.baseFiles.resolve(this.session.uri, state.dto.isBaseFile);
        } catch (error: unknown) {
            Logger.warn(`Base-file resolution failed for ${this.session.uri.path}: ${error instanceof Error ? error.message : 'unknown error'}`);
            if (isCurrent()) {
                this.post({ type: ExtensionMessageType.baseFile, payload: null });
            }
            return;
        }
        if (!isCurrent()) {
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
        const latest = this.session.current();
        if (!isCurrent() || latest.kind !== 'document') {
            return;
        }

        this.announceStaleUnits(sources, latest.dto);
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

            const nowMarked = new Map(differences.map(({ id, ...markers }) => [id, markers]));
            const previously = this.marked.get(file.index) ?? NO_MARKERS;
            this.marked.set(file.index, nowMarked);

            const set = [...nowMarked.keys()].flatMap((id) => {
                const unit = byId.get(id);
                return unit === undefined ? [] : [this.withMarkers(file.index, unit)];
            });
            // The DTO's own unit carries no markers, so sending it again is how one comes off.
            const cleared = [...previously.keys()]
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

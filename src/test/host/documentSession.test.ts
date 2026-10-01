import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { XliffDocumentSession } from '../../extension/editor/documentSession';
import { DocumentSessionRegistry } from '../../extension/editor/documentSessionRegistry';
import { XliffDocumentView } from '../../extension/editor/documentView';
import { BaseFileResolver } from '../../extension/services/baseFileResolver';
import { Logger } from '../../extension/services/logger';
import { ExtensionMessageType } from '../../shared/messages';
import { XliffState } from '../../shared/state';
import {
    documentChangeListenerCount,
    flushAppliedEdits,
    flushErrorMessages,
    flushExecutedCommands,
    FakeTextDocument,
    fireTextDocumentChange,
    flushFileWrites,
    flushInfoMessages,
    flushLogs,
    flushWarningMessages,
    reportEditsInPieces,
    resetMocks,
    setApplyEditResult,
    setConfigOverride,
    setWritableFileSystem,
} from '../__mocks__/vscode';

import type * as vscode from 'vscode';
import type { SessionState } from '../../extension/editor/documentSession';
import type { ExtensionMessage } from '../../shared/messages';

const FIXTURES = fileURLToPath(new URL('../fixtures/xliff', import.meta.url));
const read = (name: string): string => readFileSync(`${FIXTURES}/${name}`, 'utf8');

function openDocument(name: string, text = read(name)): FakeTextDocument {
    return new FakeTextDocument(`/w/${name}`, text);
}

/** Every session and registry a test opens, closed after it so that none outlives it. */
const toDispose: { dispose(): void }[] = [];

function track<T extends { dispose(): void }>(disposable: T): T {
    toDispose.push(disposable);
    return disposable;
}

function sessionFor(document: FakeTextDocument): XliffDocumentSession {
    return track(new XliffDocumentSession(document as unknown as vscode.TextDocument));
}

function view(session: XliffDocumentSession) {
    const posted: ExtensionMessage[] = [];
    const facade = new XliffDocumentView(session, message => posted.push(message));
    const send = (): void => {
        facade.sendDocument();
    };
    return { posted, facade, send };
}

const documents = (posted: readonly ExtensionMessage[]) =>
    posted.filter(message => message.type === ExtensionMessageType.setDocument);

beforeEach(() => {
    Logger.initialize({ subscriptions: [] } as unknown as vscode.ExtensionContext, 'test');
    flushLogs();
});

afterEach(() => {
    for (const disposable of toDispose.splice(0).reverse()) {
        disposable.dispose();
    }
    const listening = documentChangeListenerCount();
    vi.useRealTimers();
    resetMocks();
    expect(listening, 'a session the test opened is still listening').toBe(0);
});

describe('opening a document', () => {
    it('posts loading, then one setDocument carrying every unit', () => {
        const session = sessionFor(openDocument('Fabrikam Base.de-DE.xlf'));
        const { posted, send } = view(session);

        send();

        expect(posted.map(message => message.type)).toEqual([ExtensionMessageType.loading, ExtensionMessageType.setDocument]);
        const [document] = documents(posted);
        expect(document.type === ExtensionMessageType.setDocument && document.payload.files[0].units).toHaveLength(2500);
    });

    it('reports a base file as read-only', () => {
        const session = sessionFor(openDocument('Contoso App.g.xlf'));
        const { posted, send } = view(session);

        send();

        const [document] = documents(posted);
        expect(document.type === ExtensionMessageType.setDocument && document.payload.isBaseFile).toBe(true);
        expect(document.type === ExtensionMessageType.setDocument && document.payload.readOnly).toBe(true);
    });

    it('reports a language file as editable', () => {
        const session = sessionFor(openDocument('Contoso App.de-DE.xlf'));
        const { posted, send } = view(session);

        send();

        const [document] = documents(posted);
        expect(document.type === ExtensionMessageType.setDocument && document.payload.readOnly).toBe(false);
    });

    it('reports a document on a read-only file system as read-only', () => {
        setWritableFileSystem('file', false);
        const session = sessionFor(openDocument('Contoso App.de-DE.xlf'));
        const { posted, send } = view(session);

        send();

        const [document] = documents(posted);
        expect(document.type === ExtensionMessageType.setDocument && document.payload.isBaseFile).toBe(false);
        expect(document.type === ExtensionMessageType.setDocument && document.payload.readOnly).toBe(true);
    });

    it('parses once however many views ask for it', () => {
        const session = sessionFor(openDocument('Contoso App.de-DE.xlf'));

        view(session).send();
        view(session).send();

        expect(flushLogs().filter(line => line.includes('Parsed'))).toHaveLength(1);
    });
});

describe('a document that will not parse', () => {
    const broken = '<?xml version="1.0"?>\n<xliff version="1.2">\n  <file source-language="en">\n    <body>\n';

    it('posts an error carrying the line', () => {
        const session = sessionFor(openDocument('broken.xlf', broken));
        const { posted, send } = view(session);

        send();

        const [, second] = posted;
        expect(second.type).toBe(ExtensionMessageType.error);
        expect(second.type === ExtensionMessageType.error && second.payload.line).toBeGreaterThan(0);
        expect(documents(posted)).toHaveLength(0);
    });

    it('survives a failure the parser did not raise itself', () => {
        // fast-xml-parser has its own guards; the nested-tag limit is the reachable one,
        // and it throws a plain Error with no line. The session must still report it
        // rather than let it escape into the message handler.
        const nested = '<group>'.repeat(200);
        const closing = '</group>'.repeat(200);
        const deep = `<?xml version="1.0"?><xliff version="1.2"><file source-language="en"><body>${nested}<trans-unit id="1"><source>a</source></trans-unit>${closing}</body></file></xliff>`;
        const session = sessionFor(openDocument('deep.xlf', deep));
        const { posted, send } = view(session);

        send();

        const [, second] = posted;
        expect(second.type).toBe(ExtensionMessageType.error);
        expect(second.type === ExtensionMessageType.error && second.payload.message).toContain('nested');
        expect(second.type === ExtensionMessageType.error && second.payload.line).toBeUndefined();
    });

    it('rejects a structurally invalid document that is well-formed XML', () => {
        const duplicate = `<?xml version="1.0"?>
<xliff version="1.2"><file source-language="en" target-language="de"><body>
  <trans-unit id="1"><source>a</source></trans-unit>
  <trans-unit id="1"><source>b</source></trans-unit>
</body></file></xliff>`;
        const session = sessionFor(openDocument('duplicate.xlf', duplicate));
        const { posted, send } = view(session);

        send();

        const [, second] = posted;
        expect(second.type === ExtensionMessageType.error && second.payload.message).toContain('Duplicate');
    });

});

describe('what a failing re-parse puts on the wire', () => {
    it('sends only the failure to a view that already has the document', () => {
        // The panel already displays the last good document; re-sending it would cost a
        // whole DTO per failing keystroke burst.
        vi.useFakeTimers();
        const document = openDocument('Fabrikam Base.de-DE.xlf');
        const session = sessionFor(document);
        const posted: ExtensionMessage[] = [];
        const facade = new XliffDocumentView(session, message => posted.push(message));
        session.attach(change => facade.apply(change));
        session.current();

        document.setText('<xliff><file>');
        fireTextDocumentChange(document);
        vi.advanceTimersByTime(200);

        expect(posted.map(message => message.type)).toEqual([ExtensionMessageType.error]);
        expect(JSON.stringify(posted).length).toBeLessThan(1024);
    });

    it('still gives a view that has nothing the last good document first', () => {
        vi.useFakeTimers();
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        session.attach(() => { /* keeps the session live */ });
        session.current();

        document.setText('<xliff><file>');
        fireTextDocumentChange(document);
        vi.advanceTimersByTime(200);

        const fresh = view(session);
        fresh.send();

        expect(fresh.posted.map(message => message.type)).toEqual([
            ExtensionMessageType.loading,
            ExtensionMessageType.setDocument,
            ExtensionMessageType.error,
        ]);
    });

    it('sends the document again when a re-parse succeeds — the content really did change', () => {
        vi.useFakeTimers();
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const posted: ExtensionMessage[] = [];
        const facade = new XliffDocumentView(session, message => posted.push(message));
        session.attach(change => facade.apply(change));
        session.current();

        document.setText(read('Contoso App.en-US.xlf'));
        fireTextDocumentChange(document);
        vi.advanceTimersByTime(200);

        expect(posted.map(message => message.type)).toEqual([ExtensionMessageType.setDocument]);
    });
});

describe('reacting to an external edit', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('re-parses once for a burst of changes, after the debounce', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const states: SessionState[] = [];
        session.attach((change) => {
            if (change.kind === 'parsed') {
                states.push(change.state);
            }
        });
        session.current();
        flushLogs();

        for (let keystroke = 0; keystroke < 5; keystroke++) {
            fireTextDocumentChange(document);
            vi.advanceTimersByTime(40);
        }
        expect(states).toHaveLength(0);

        vi.advanceTimersByTime(150);

        expect(states).toHaveLength(1);
        expect(flushLogs().filter(line => line.includes('Parsed'))).toHaveLength(1);
    });

    it('does not drop the final change of a burst', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const states: SessionState[] = [];
        session.attach((change) => {
            if (change.kind === 'parsed') {
                states.push(change.state);
            }
        });
        session.current();

        fireTextDocumentChange(document);
        vi.advanceTimersByTime(100);
        document.setText(read('Contoso App.en-US.xlf'));
        fireTextDocumentChange(document);
        vi.advanceTimersByTime(200);

        expect(states).toHaveLength(1);
        const [state] = states;
        expect(state.kind === 'document' && state.dto.files[0].targetLanguage).toBe('en-US');
    });

    it('notifies every attached view of one re-parse', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const first: SessionState[] = [];
        const second: SessionState[] = [];
        session.attach((change) => {
            if (change.kind === 'parsed') {
                first.push(change.state);
            }
        });
        session.attach((change) => {
            if (change.kind === 'parsed') {
                second.push(change.state);
            }
        });
        session.current();
        flushLogs();

        fireTextDocumentChange(document);
        vi.advanceTimersByTime(200);

        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
        expect(flushLogs().filter(line => line.includes('Parsed'))).toHaveLength(1);
    });

    it('ignores a change to a different document', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const states: SessionState[] = [];
        session.attach((change) => {
            if (change.kind === 'parsed') {
                states.push(change.state);
            }
        });

        fireTextDocumentChange(openDocument('somewhere-else.xlf', '<xliff/>'));
        vi.advanceTimersByTime(200);

        expect(states).toHaveLength(0);
    });

    it('ignores an event that carries no content change', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const states: SessionState[] = [];
        session.attach((change) => {
            if (change.kind === 'parsed') {
                states.push(change.state);
            }
        });

        fireTextDocumentChange(document, 0);
        vi.advanceTimersByTime(200);

        expect(states).toHaveLength(0);
    });

    it('stops re-parsing once disposed', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const states: SessionState[] = [];
        session.attach((change) => {
            if (change.kind === 'parsed') {
                states.push(change.state);
            }
        });

        fireTextDocumentChange(document);
        session.dispose();
        vi.advanceTimersByTime(200);

        expect(states).toHaveLength(0);
        expect(documentChangeListenerCount()).toBe(0);
    });
});

describe('the registry', () => {
    it('hands two editors of one document the same session', () => {
        const registry = track(new DocumentSessionRegistry());
        const document = openDocument('minimal.xlf');

        expect(registry.acquire(document as unknown as vscode.TextDocument))
            .toBe(registry.acquire(document as unknown as vscode.TextDocument));
        expect(registry.size).toBe(1);
        expect(documentChangeListenerCount()).toBe(1);
    });

    it('keeps the session alive while a second editor still holds it', () => {
        const registry = track(new DocumentSessionRegistry());
        const document = openDocument('minimal.xlf');
        const session = registry.acquire(document as unknown as vscode.TextDocument);
        registry.acquire(document as unknown as vscode.TextDocument);

        registry.release(session);
        expect(registry.size).toBe(1);
        expect(documentChangeListenerCount()).toBe(1);

        registry.release(session);
        expect(registry.size).toBe(0);
        expect(documentChangeListenerCount()).toBe(0);
    });

    it('gives different documents different sessions', () => {
        const registry = track(new DocumentSessionRegistry());
        const first = registry.acquire(openDocument('a.xlf', '<xliff/>') as unknown as vscode.TextDocument);
        const second = registry.acquire(openDocument('b.xlf', '<xliff/>') as unknown as vscode.TextDocument);

        expect(first).not.toBe(second);
        expect(registry.size).toBe(2);
    });

    it('disposes everything it holds', () => {
        const registry = track(new DocumentSessionRegistry());
        registry.acquire(openDocument('a.xlf', '<xliff/>') as unknown as vscode.TextDocument);
        registry.acquire(openDocument('b.xlf', '<xliff/>') as unknown as vscode.TextDocument);

        registry.dispose();

        expect(registry.size).toBe(0);
        expect(documentChangeListenerCount()).toBe(0);
    });

    it('ignores a release for a session it never handed out', () => {
        const registry = track(new DocumentSessionRegistry());
        expect(() => registry.release(sessionFor(openDocument('a.xlf', '<xliff/>')))).not.toThrow();
    });
});

describe('opening the raw file', () => {
    it('opens the document itself with the built-in editor', async () => {
        const session = sessionFor(openDocument('minimal.xlf'));
        const { facade } = view(session);

        await facade.openSource('text');

        expect(flushExecutedCommands()).toEqual([
            { command: 'vscode.openWith', args: [session.uri, 'default'] },
        ]);
    });

    it('works for a document that will not parse — which is when it is needed', async () => {
        const session = sessionFor(openDocument('broken.xlf', '<xliff><file>'));
        const { facade, send } = view(session);

        send();
        await facade.openSource('text');

        expect(flushExecutedCommands()).toHaveLength(1);
    });
});

describe('writing a target', () => {
    const LANGUAGE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2">
        <source>Customer</source>
        <target state="translated">ExampleTranslation</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

    /** Applies the one edit the session produced to the text it was produced against. */
    function applied(document: FakeTextDocument, before: string): string {
        const edits = flushAppliedEdits();
        expect(edits).toHaveLength(1);
        const [edit] = edits;
        const start = document.offsetAt(edit.range.start);
        const end = document.offsetAt(edit.range.end);
        return before.slice(0, start) + edit.newText + before.slice(end);
    }

    it('changes only the characters inside the target', async () => {
        const document = openDocument('language.xlf', LANGUAGE);
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation');

        expect(applied(document, LANGUAGE)).toBe(LANGUAGE.replace('ExampleTranslation', 'NewTranslation'));
    });

    it('writes through a WorkspaceEdit rather than the file system', async () => {
        const document = openDocument('language.xlf', LANGUAGE);
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation');

        expect(flushAppliedEdits()).toHaveLength(1);
        expect(flushFileWrites()).toEqual([]);
    });

    it('does nothing at all when the target already says that', async () => {
        // An empty edit would dirty the document for no reason.
        const document = openDocument('language.xlf', LANGUAGE);
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'ExampleTranslation');

        expect(flushAppliedEdits()).toEqual([]);
    });

    it('changes the state without touching the text', async () => {
        const document = openDocument('language.xlf', LANGUAGE);
        const { facade } = view(sessionFor(document));

        await facade.updateState({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, XliffState.needsReviewTranslation);

        expect(applied(document, LANGUAGE)).toBe(LANGUAGE.replace('state="translated"', 'state="needs-review-translation"'));
    });

    it('gives a unit with no target one, rather than refusing', async () => {
        const noTarget = LANGUAGE.replace('        <target state="translated">ExampleTranslation</target>\n', '');
        const document = openDocument('language.xlf', noTarget);
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation', XliffState.translated);

        expect(applied(document, noTarget)).toContain('<target state="translated">NewTranslation</target>');
    });

    it('re-parses first when the document moved on since the model was built', async () => {
        // The writer trims against the text it is given, so a model built from stale text lands
        // its edit in the wrong place. The re-parse is debounced, so typing can reach this window.
        vi.useFakeTimers();
        const document = openDocument('language.xlf', LANGUAGE);
        const session = sessionFor(document);
        const { facade } = view(session);
        session.current();

        const moved = LANGUAGE.replace('<source>Customer</source>', '<source>Customer, renamed elsewhere</source>');
        document.setText(moved);
        fireTextDocumentChange(document);

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation');

        expect(applied(document, moved)).toBe(moved.replace('ExampleTranslation', 'NewTranslation'));
    });
});

describe('what the write path refuses', () => {
    const BASE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="en-US" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2"><source>Customer</source></trans-unit>
    </body>
  </file>
</xliff>
`;

    const WITH_COMMENT = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <!-- somebody wrote this by hand -->
  <file source-language="en-US" target-language="de-DE" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2">
        <source>Customer</source>
        <target state="translated">ExampleTranslation</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

    it('refuses a base file, and says whose it is', async () => {
        const document = openDocument('App.g.xlf', BASE);
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation');

        expect(flushAppliedEdits()).toEqual([]);
        expect(flushInfoMessages()[0]).toContain('base file');
    });

    it('refuses a read-only file system', async () => {
        setWritableFileSystem('file', false);
        const document = openDocument('language.xlf', WITH_COMMENT.replace('  <!-- somebody wrote this by hand -->\n', ''));
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation');

        expect(flushAppliedEdits()).toEqual([]);
        expect(flushInfoMessages()[0]).toBe('This file is read-only.');
    });

    it('refuses a document that does not parse', async () => {
        const document = openDocument('language.xlf', '<xliff version="1.2"><file>');
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation');

        expect(flushAppliedEdits()).toEqual([]);
        expect(flushInfoMessages()[0]).toContain('until it parses');
    });

    it('opens a document carrying XML comments read-only, and refuses to write it', async () => {
        // The parser drops comments, so a write would silently take them with it.
        const document = openDocument('language.xlf', WITH_COMMENT);
        const { facade, posted, send } = view(sessionFor(document));

        send();
        const [opened] = documents(posted);
        expect(opened.type === ExtensionMessageType.setDocument && opened.payload.readOnly).toBe(true);
        posted.length = 0;
        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 2' }, 'NewTranslation');

        const reason = 'This file contains XML comments, which this editor cannot write back. Edit it as text instead.';
        expect(flushAppliedEdits()).toEqual([]);
        expect(flushInfoMessages()).toEqual([reason]);
        expect(opened.type === ExtensionMessageType.setDocument && opened.payload.readOnlyReason).toBe(reason);
        expect(posted).toEqual([{
            type: ExtensionMessageType.patchUnits,
            payload: { fileIndex: 0, units: [expect.objectContaining({ id: 'Table 1 - Property 2', target: 'ExampleTranslation' })] },
        }]);
    });

    it('says so when the id is not in the document, and writes nothing', async () => {
        const document = openDocument('language.xlf', BASE.replace('target-language="en-US"', 'target-language="de-DE"'));
        const { facade } = view(sessionFor(document));

        await facade.updateTarget({ fileIndex: 0, unitId: 'Table 9 - Property 9' }, 'NewTranslation');

        expect(flushAppliedEdits()).toEqual([]);
        expect(flushErrorMessages()[0]).toContain('Table 9 - Property 9');
    });
});
describe('recognising our own edit', () => {
    const LANGUAGE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2">
        <source>Customer</source>
        <target state="translated">ExampleTranslation</target>
      </trans-unit>
      <trans-unit id="Table 1 - Property 3">
        <source>Vendor</source>
        <target state="translated">AnotherTranslation</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

    const UNIT = { fileIndex: 0, unitId: 'Table 1 - Property 2' };
    const types = (posted: readonly ExtensionMessage[]) => posted.map(message => message.type);

    function edited(text: string) {
        const document = openDocument('language.xlf', text);
        const session = sessionFor(document);
        const posted: ExtensionMessage[] = [];
        const facade = new XliffDocumentView(session, message => posted.push(message));
        session.attach(change => facade.apply(change));
        session.current();
        posted.length = 0;
        return { document, session, facade, posted };
    }

    it('answers its own edit with a patch, never a whole document', async () => {
        // Re-sending the whole document per keystroke is what costs the view its focus and scroll.
        const { facade, posted } = edited(LANGUAGE);

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(types(posted)).toEqual([ExtensionMessageType.patchUnits]);
        const [patch] = posted;
        expect(patch.type === ExtensionMessageType.patchUnits && patch.payload.units).toEqual([
            expect.objectContaining({ id: UNIT.unitId, target: 'EditedTranslation' }),
        ]);
    });

    it('edits and patches the unit of the named <file> when another file has the same id', async () => {
        const twoFiles = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2">
        <source>Customer</source>
        <target state="translated">Kunde</target>
      </trans-unit>
    </body>
  </file>
  <file source-language="en-US" target-language="fr-FR" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2">
        <source>Customer</source>
        <target state="translated">Client</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;
        const { document, facade, posted } = edited(twoFiles);

        await facade.updateTarget({ fileIndex: 1, unitId: UNIT.unitId }, 'Acheteur');

        expect(document.getText()).toBe(twoFiles.replace('>Client<', '>Acheteur<'));
        expect(posted).toEqual([{
            type: ExtensionMessageType.patchUnits,
            payload: { fileIndex: 1, units: [expect.objectContaining({ id: UNIT.unitId, target: 'Acheteur' })] },
        }]);
    });

    it('patches only the unit that changed', async () => {
        const { facade, posted } = edited(LANGUAGE);

        await facade.updateTarget(UNIT, 'EditedTranslation');

        const [patch] = posted;
        expect(patch.type === ExtensionMessageType.patchUnits && patch.payload.units).toHaveLength(1);
        expect(patch.type === ExtensionMessageType.patchUnits && patch.payload.fileIndex).toBe(0);
    });

    it('carries the new state, so the roll-up and the header can move', async () => {
        const { facade, posted } = edited(LANGUAGE);

        await facade.updateState(UNIT, XliffState.needsReviewTranslation);

        const [patch] = posted;
        expect(patch.type === ExtensionMessageType.patchUnits && patch.payload.units[0].state)
            .toBe(XliffState.needsReviewTranslation);
    });

    it('treats an edit it did not make as external, and re-parses in full', () => {
        vi.useFakeTimers();
        const { document, posted } = edited(LANGUAGE);

        const before = document.getText();
        document.setText(before.replace('AnotherTranslation', 'SomebodyElseTyped'));
        fireTextDocumentChange(document, [{
            rangeOffset: before.indexOf('AnotherTranslation'),
            rangeLength: 'AnotherTranslation'.length,
            text: 'SomebodyElseTyped',
        }]);
        vi.advanceTimersByTime(200);

        expect(types(posted)).toEqual([ExtensionMessageType.setDocument]);
    });

    it('does not swallow an external edit that lands between recording ours and seeing it', async () => {
        // Our edit is recorded, then somebody else's arrives *first*. The assertion must land in
        // that window: once ours arrives too, the re-parse it triggers would hide the difference.
        vi.useFakeTimers();
        const { document, facade, posted } = edited(LANGUAGE);

        const before = document.getText();
        const editing = facade.updateTarget(UNIT, 'EditedTranslation');
        fireTextDocumentChange(document, [{
            rangeOffset: before.indexOf('AnotherTranslation'),
            rangeLength: 'AnotherTranslation'.length,
            text: 'SomebodyElseTyped',
        }]);

        // The foreign edit must have scheduled a full re-parse. A bare boolean would have
        // taken it for ours and scheduled nothing, leaving the model missing that change
        // while believing itself current.
        vi.advanceTimersByTime(200);
        expect(types(posted)).toEqual([ExtensionMessageType.setDocument]);

        await editing;
    });

    it('absorbs its own edit exactly once, so a repeat of it is external', async () => {
        // Without consuming the record, a later change with the *same* span and text would
        // be taken for ours too — the user pasting back what we just wrote.
        vi.useFakeTimers();
        const { document, facade, posted } = edited(LANGUAGE);

        await facade.updateTarget(UNIT, 'EditedTranslation');
        const [applied] = flushAppliedEdits();
        expect(types(posted)).toEqual([ExtensionMessageType.patchUnits]);

        const start = document.offsetAt(applied.range.start);
        fireTextDocumentChange(document, [{
            rangeOffset: start,
            rangeLength: document.offsetAt(applied.range.end) - start,
            text: applied.newText,
        }]);
        await vi.advanceTimersByTimeAsync(250);

        expect(types(posted)).toEqual([ExtensionMessageType.patchUnits, ExtensionMessageType.setDocument]);
    });

    it('matches the text the edit leaves, so our text arriving elsewhere is external', async () => {
        vi.useFakeTimers();
        const { document, facade, posted } = edited(LANGUAGE);

        // Recorded before the first await: the pending edit and the request to apply it.
        const editing = facade.updateTarget(UNIT, 'EditedTranslation');
        const [applied] = flushAppliedEdits();

        // Somebody else writes the very same text into another unit, before ours lands.
        const before = document.getText();
        const at = before.indexOf('AnotherTranslation');
        document.setText(before.slice(0, at) + applied.newText + before.slice(at));
        fireTextDocumentChange(document, [{ rangeOffset: at, rangeLength: 0, text: applied.newText }]);
        vi.advanceTimersByTime(200);

        expect(types(posted)).toEqual([ExtensionMessageType.setDocument]);
        await editing;
    });

    it('tells every view of the document, not only the one that asked', async () => {
        // Two editors share one session. A patch that reached only the editing view would
        // leave the other showing a target the file no longer has.
        const document = openDocument('language.xlf', LANGUAGE);
        const session = sessionFor(document);
        const first: ExtensionMessage[] = [];
        const second: ExtensionMessage[] = [];
        const facade = new XliffDocumentView(session, message => first.push(message));
        session.attach(change => facade.apply(change));
        const other = new XliffDocumentView(session, message => second.push(message));
        session.attach(change => other.apply(change));
        session.current();
        first.length = 0;
        second.length = 0;

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(types(first)).toEqual([ExtensionMessageType.patchUnits]);
        expect(types(second)).toEqual([ExtensionMessageType.patchUnits]);
    });

    it('keeps the model and its text in step, so the next edit lands correctly', async () => {
        const { document, facade, posted } = edited(LANGUAGE);

        await facade.updateTarget(UNIT, 'First');
        await facade.updateTarget(UNIT, 'Second');

        expect(types(posted)).toEqual([ExtensionMessageType.patchUnits, ExtensionMessageType.patchUnits]);
        expect(document.getText()).toBe(LANGUAGE.replace('ExampleTranslation', 'Second'));
    });

    it('recognises its own edit when the editor reports it in pieces', async () => {
        vi.useFakeTimers();
        reportEditsInPieces(true);
        const { facade, posted } = edited(LANGUAGE);

        await facade.updateTarget(UNIT, 'EditedTranslation');
        vi.advanceTimersByTime(200);

        expect(types(posted)).toEqual([ExtensionMessageType.patchUnits]);
    });

    it('recognises its own edit of a target with a line break, in a CRLF file', async () => {
        // The editor writes the break with the file's own line ending; ours must match it.
        vi.useFakeTimers();
        const { facade, posted } = edited(LANGUAGE.replace(/\n/g, '\r\n'));

        await facade.updateTarget(UNIT, 'First line\nSecond line');
        vi.advanceTimersByTime(200);

        expect(types(posted)).toEqual([ExtensionMessageType.patchUnits]);
    });

    describe('when the editor refuses it', () => {
        const SAVED = [expect.objectContaining({ id: UNIT.unitId, target: 'ExampleTranslation' })];

        it('sends the unit again with its saved value, and says why', async () => {
            const { facade, posted } = edited(LANGUAGE);
            setApplyEditResult(false);

            await facade.updateTarget(UNIT, 'EditedTranslation');

            expect(posted).toEqual([{ type: ExtensionMessageType.patchUnits, payload: { fileIndex: 0, units: SAVED } }]);
            expect(flushWarningMessages()).toEqual([expect.stringContaining('shows its saved value again')]);
        });

        it('takes the edit back out of the model, so the next edit does not write it too', async () => {
            const { document, facade } = edited(LANGUAGE);
            setApplyEditResult(false);
            await facade.updateTarget(UNIT, 'EditedTranslation');

            setApplyEditResult(true);
            await facade.updateTarget({ fileIndex: 0, unitId: 'Table 1 - Property 3' }, 'Changed');

            expect(document.getText()).toBe(LANGUAGE.replace('AnotherTranslation', 'Changed'));
        });

        it('treats an edit that throws as refused, and forgets it was pending', async () => {
            const { document, facade, posted } = edited(LANGUAGE);
            setApplyEditResult(new Error('the editor went away'));

            await facade.updateTarget(UNIT, 'EditedTranslation');

            expect(posted).toEqual([{ type: ExtensionMessageType.patchUnits, payload: { fileIndex: 0, units: SAVED } }]);
            expect(flushWarningMessages()).toHaveLength(1);
            expect(flushLogs().join('\n')).toContain('the editor went away');

            // The same span and text from somebody else is now their edit, not ours.
            const [attempted] = flushAppliedEdits();
            const start = document.offsetAt(attempted.range.start);
            posted.length = 0;
            vi.useFakeTimers();
            fireTextDocumentChange(document, [{
                rangeOffset: start,
                rangeLength: document.offsetAt(attempted.range.end) - start,
                text: attempted.newText,
            }]);
            vi.advanceTimersByTime(200);

            expect(types(posted)).toEqual([ExtensionMessageType.setDocument]);
        });

        it('sends the unit again on every other refusal too', async () => {
            const { facade, posted } = edited(LANGUAGE.replace('<body>', '<body>\n      <!-- kept -->'));

            await facade.updateState(UNIT, XliffState.signedOff);

            expect(posted).toEqual([{ type: ExtensionMessageType.patchUnits, payload: { fileIndex: 0, units: SAVED } }]);
            expect(flushInfoMessages()).toEqual([expect.stringContaining('XML comments')]);
        });
    });
});
describe('the BOM a save does not keep', () => {
    const LANGUAGE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2">
        <source>ExampleSourceText</source>
        <target state="translated">ExampleTranslation</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

    const UNIT = { fileIndex: 0, unitId: 'Table 1 - Property 2' };

    it('says so the first time such a file is edited', async () => {
        const document = new FakeTextDocument('/w/App.de-DE.xlf', LANGUAGE, 'utf8bom');
        const { facade } = view(sessionFor(document));

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(flushWarningMessages()[0]).toContain('byte-order mark');
    });

    it('says it once, however many edits follow', async () => {
        const document = new FakeTextDocument('/w/App.de-DE.xlf', LANGUAGE, 'utf8bom');
        const { facade } = view(sessionFor(document));

        await facade.updateTarget(UNIT, 'First');
        await facade.updateTarget(UNIT, 'Second');

        expect(flushWarningMessages()).toHaveLength(1);
    });

    it('says it once per document, not once per editor', async () => {
        // Two editors on one file are one file; the reader hears this once.
        const document = new FakeTextDocument('/w/App.de-DE.xlf', LANGUAGE, 'utf8bom');
        const session = sessionFor(document);
        const first = new XliffDocumentView(session, () => { });
        const second = new XliffDocumentView(session, () => { });

        await first.updateTarget(UNIT, 'First');
        await second.updateTarget(UNIT, 'Second');

        expect(flushWarningMessages()).toHaveLength(1);
    });

    it('stays quiet for a file with no BOM', async () => {
        const document = openDocument('language.xlf', LANGUAGE);
        const { facade } = view(sessionFor(document));

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(flushWarningMessages()).toEqual([]);
    });

    it('warns rather than refuses — the edit still lands', async () => {
        const document = new FakeTextDocument('/w/App.de-DE.xlf', LANGUAGE, 'utf8bom');
        const { facade } = view(sessionFor(document));

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(document.getText()).toBe(LANGUAGE.replace('ExampleTranslation', 'EditedTranslation'));
    });
});

describe('what an edit does to the state', () => {
    const LANGUAGE = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2">
  <file source-language="en-US" target-language="de-DE" original="App">
    <body>
      <trans-unit id="Table 1 - Property 2">
        <source>ExampleSourceText</source>
        <target state="needs-translation">ExampleTranslation</target>
      </trans-unit>
    </body>
  </file>
</xliff>
`;

    const UNIT = { fileIndex: 0, unitId: 'Table 1 - Property 2' };

    /** The `<target>` line the edit produced, applied to the text it was produced against. */
    function targetLine(document: FakeTextDocument, before: string): string {
        const edits = flushAppliedEdits();
        expect(edits).toHaveLength(1);
        const [applied] = edits;
        const start = document.offsetAt(applied.range.start);
        const end = document.offsetAt(applied.range.end);
        const after = before.slice(0, start) + applied.newText + before.slice(end);
        return (after.split('\n').find(line => line.includes('<target')) ?? '(no target)').trim();
    }

    function opened(text = LANGUAGE) {
        const document = openDocument('language.xlf', text);
        const { facade } = view(sessionFor(document));
        return { document, facade };
    }

    it('applies stateOnEdit when nobody chose a state', async () => {
        const { document, facade } = opened();

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(targetLine(document, LANGUAGE)).toBe('<target state="translated">EditedTranslation</target>');
    });

    it('follows the setting rather than a hard-coded default', async () => {
        setConfigOverride('xliffViewer.stateOnEdit', XliffState.needsReviewTranslation);
        const { document, facade } = opened();

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(targetLine(document, LANGUAGE)).toBe('<target state="needs-review-translation">EditedTranslation</target>');
    });

    it('reads the setting at edit time, so changing it needs no reload', async () => {
        const { document, facade } = opened();

        setConfigOverride('xliffViewer.stateOnEdit', XliffState.signedOff);
        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(targetLine(document, LANGUAGE)).toBe('<target state="signed-off">EditedTranslation</target>');
    });

    it('ignores a stateOnEdit the spec does not define, rather than writing it', async () => {
        setConfigOverride('xliffViewer.stateOnEdit', 'whatever-the-user-typed');
        const { document, facade } = opened();

        await facade.updateTarget(UNIT, 'EditedTranslation');

        expect(targetLine(document, LANGUAGE)).toBe('<target state="translated">EditedTranslation</target>');
    });

    it('leaves a state the reader chose alone', async () => {
        // The webview sends the choice with the edit; `stateOnEdit` does not overrule it.
        const { document, facade } = opened();

        await facade.updateTarget(UNIT, 'EditedTranslation', XliffState.needsReviewTranslation);

        expect(targetLine(document, LANGUAGE)).toBe('<target state="needs-review-translation">EditedTranslation</target>');
    });

    it('sets needs-translation when the target is cleared, and writes AL self-closing form', async () => {
        const { document, facade } = opened();

        await facade.updateTarget(UNIT, '');

        expect(targetLine(document, LANGUAGE)).toBe('<target state="needs-translation"/>');
    });

    it('lets clearing outrank even a state the reader chose', async () => {
        // An empty target cannot be signed off, whatever anybody picked.
        const { document, facade } = opened();

        await facade.updateTarget(UNIT, '', XliffState.signedOff);

        expect(targetLine(document, LANGUAGE)).toBe('<target state="needs-translation"/>');
    });

    it('gives a unit with no target one, indented where the serialiser puts it', async () => {
        const withoutTarget = LANGUAGE.replace('        <target state="needs-translation">ExampleTranslation</target>\n', '');
        const { document, facade } = opened(withoutTarget);

        await facade.updateTarget(UNIT, 'FirstTranslation');

        expect(targetLine(document, withoutTarget)).toBe('<target state="translated">FirstTranslation</target>');
    });

    it('does not touch the state when only the state was asked to change', async () => {
        const { document, facade } = opened();

        await facade.updateState(UNIT, XliffState.needsAdaptation);

        expect(targetLine(document, LANGUAGE)).toBe('<target state="needs-adaptation">ExampleTranslation</target>');
    });
});

describe('when base-file resolution itself fails', () => {
    it('says there is no base file rather than leaving the question open', async () => {
        // `null` and `undefined` are different answers on this message: `null` means
        // resolution ran and found nothing, which the header states out loud; `undefined`
        // means it has not run, and the header waits. A resolver that throws must produce
        // the first, or the header waits for an answer that is never coming.
        const resolver = new BaseFileResolver();
        vi.spyOn(resolver, 'resolve').mockRejectedValue(new Error('the workspace went away'));
        const session = sessionFor(openDocument('Contoso App.de-DE.xlf', read('Contoso App.de-DE.xlf')));
        const posted: ExtensionMessage[] = [];

        try {
            const facade = new XliffDocumentView(session, message => posted.push(message), { baseFiles: resolver });
            facade.sendDocument();
            await vi.waitFor(() => {
                expect(flushLogs().join(' ')).toContain('Base-file resolution failed');
            });
            const answers = posted.filter(message => message.type === ExtensionMessageType.baseFile);

            expect(answers).toHaveLength(1);
            expect(answers[0].payload).toBeNull();
            facade.dispose();
        } finally {
            resolver.dispose();
            session.dispose();
        }
    });
});

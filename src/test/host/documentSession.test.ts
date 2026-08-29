import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { XliffDocumentSession } from '../../extension/editor/documentSession';
import { DocumentSessionRegistry } from '../../extension/editor/documentSessionRegistry';
import { createDocumentSession, postUpdate } from '../../extension/editor/documentView';
import { Logger } from '../../extension/services/logger';
import { ExtensionMessageType } from '../../shared/messages';
import {
    documentChangeListenerCount,
    flushExecutedCommands,
    FakeTextDocument,
    fireTextDocumentChange,
    flushLogs,
    resetMocks,
    setWritableFileSystem,
} from '../__mocks__/vscode';

import type * as vscode from 'vscode';
import type { SessionState } from '../../extension/editor/documentSession';
import type { ExtensionMessage } from '../../shared/messages';

const EXAMPLES = fileURLToPath(new URL('../../../Examples', import.meta.url));
const read = (name: string): string => readFileSync(`${EXAMPLES}/${name}`, 'utf8');

function openDocument(name: string, text = read(name)): FakeTextDocument {
    return new FakeTextDocument(`/w/${name}`, text);
}

function sessionFor(document: FakeTextDocument): XliffDocumentSession {
    return new XliffDocumentSession(document as unknown as vscode.TextDocument);
}

function view(session: XliffDocumentSession) {
    const posted: ExtensionMessage[] = [];
    const facade = createDocumentSession(session, message => posted.push(message));
    // `sendDocument` may be async by contract even though this implementation is not.
    const send = (): void => {
        void facade.sendDocument();
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
    vi.useRealTimers();
    resetMocks();
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

    it('reports a document on a read-only file system as read-only (§12.5)', () => {
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
        // Re-sending the last good DTO here cost 1175 KB per failing keystroke burst on
        // the large file, to redeliver what the panel was already displaying.
        vi.useFakeTimers();
        const document = openDocument('Fabrikam Base.de-DE.xlf');
        const session = sessionFor(document);
        const posted: ExtensionMessage[] = [];
        session.attach(state => postUpdate(state, message => posted.push(message)));
        session.current();

        document.setText('<xliff><file>');
        fireTextDocumentChange(document);
        vi.advanceTimersByTime(200);

        expect(posted.map(message => message.type)).toEqual([ExtensionMessageType.error]);
        expect(JSON.stringify(posted).length).toBeLessThan(1024);
    });

    it('still gives a view that has nothing the last good document first (§7.7)', () => {
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
        session.attach(state => postUpdate(state, message => posted.push(message)));
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
        session.attach(state => states.push(state));
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
        session.attach(state => states.push(state));
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
        session.attach(state => first.push(state));
        session.attach(state => second.push(state));
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
        session.attach(state => states.push(state));

        fireTextDocumentChange(openDocument('somewhere-else.xlf', '<xliff/>'));
        vi.advanceTimersByTime(200);

        expect(states).toHaveLength(0);
    });

    it('ignores an event that carries no content change', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const states: SessionState[] = [];
        session.attach(state => states.push(state));

        fireTextDocumentChange(document, 0);
        vi.advanceTimersByTime(200);

        expect(states).toHaveLength(0);
    });

    it('stops re-parsing once disposed', () => {
        const document = openDocument('Contoso App.de-DE.xlf');
        const session = sessionFor(document);
        const states: SessionState[] = [];
        session.attach(state => states.push(state));

        fireTextDocumentChange(document);
        session.dispose();
        vi.advanceTimersByTime(200);

        expect(states).toHaveLength(0);
        expect(documentChangeListenerCount()).toBe(0);
    });
});

describe('the registry', () => {
    it('hands two editors of one document the same session', () => {
        const registry = new DocumentSessionRegistry();
        const document = openDocument('test.xlf');

        expect(registry.acquire(document as unknown as vscode.TextDocument))
            .toBe(registry.acquire(document as unknown as vscode.TextDocument));
        expect(registry.size).toBe(1);
        expect(documentChangeListenerCount()).toBe(1);
    });

    it('keeps the session alive while a second editor still holds it', () => {
        const registry = new DocumentSessionRegistry();
        const document = openDocument('test.xlf');
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
        const registry = new DocumentSessionRegistry();
        const first = registry.acquire(openDocument('a.xlf', '<xliff/>') as unknown as vscode.TextDocument);
        const second = registry.acquire(openDocument('b.xlf', '<xliff/>') as unknown as vscode.TextDocument);

        expect(first).not.toBe(second);
        expect(registry.size).toBe(2);
    });

    it('disposes everything it holds', () => {
        const registry = new DocumentSessionRegistry();
        registry.acquire(openDocument('a.xlf', '<xliff/>') as unknown as vscode.TextDocument);
        registry.acquire(openDocument('b.xlf', '<xliff/>') as unknown as vscode.TextDocument);

        registry.dispose();

        expect(registry.size).toBe(0);
        expect(documentChangeListenerCount()).toBe(0);
    });

    it('ignores a release for a session it never handed out', () => {
        const registry = new DocumentSessionRegistry();
        expect(() => registry.release(sessionFor(openDocument('a.xlf', '<xliff/>')))).not.toThrow();
    });
});

describe('opening the raw file', () => {
    it('opens the document itself with the built-in editor', async () => {
        const session = sessionFor(openDocument('test.xlf'));
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

describe('actions that are not wired yet', () => {
    it('say which task owns them instead of doing nothing', () => {
        const session = sessionFor(openDocument('test.xlf'));
        const { facade } = view(session);

        expect(() => facade.updateTarget({ fileIndex: 0, unitId: '1' }, 'x')).toThrow('EDIT-01');
        expect(() => facade.updateState({ fileIndex: 0, unitId: '1' }, 'translated')).toThrow('EDIT-01');
        expect(() => facade.openSource('al')).toThrow('NAV-02');
        expect(() => facade.openSource('base')).toThrow('NAV-02');
        // Revealing a specific unit still needs the id search of §10.2.
        expect(() => facade.openSource('text', { fileIndex: 0, unitId: '1' })).toThrow('NAV-02');
    });
});

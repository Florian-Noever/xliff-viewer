/**
 * The XLIFF fixture corpus under `src/test/fixtures/xliff/`, as generated text.
 *
 * Every name, text and id is invented. The shape is the one the AL compiler writes — the
 * declaration, BOM and line ending of each file role, two-space indentation, attribute
 * order and self-closing empty elements — so the round-trip tests still hold the serialiser
 * to AL's formatting.
 *
 * `corpus.test.ts` fails when a committed file differs from this output. A `data` run with
 * `UPDATE_FIXTURES=1` writes the files first, through `src/test/setup/fixtures.ts`.
 *
 * Ids are hashed with the production `alNameHash`, so every id is the one AL would write for
 * the same names; `alNameHash.test.ts` holds that function to values AL is known to write.
 */

import { appUnits, hashedIdOf, identifier, quoteNameIfNeeded } from './alApp';
import { renderApp } from './alRender';
import { NORTHWIND } from './northwind';
import { alNameHash } from '../../extension/xliff/alNameHash';

import type { AlApp, AlLabel, AlProperty, PathStep } from './alApp';
import type { AppManifest } from './alRender';

export const FIXTURE = {
    base: 'Contoso App.g.xlf',
    english: 'Contoso App.en-US.xlf',
    german: 'Contoso App.de-DE.xlf',
    large: 'Fabrikam Base.de-DE.xlf',
    minimal: 'minimal.xlf',
    namespacedBase: 'Northwind App.g.xlf',
    namespacedGerman: 'Northwind App.de-DE.xlf',
} as const;

export interface FixtureFile {
    readonly name: string;
    readonly text: string;
}

interface Draft {
    readonly path: readonly PathStep[];
    readonly source: string;
    readonly german: string;
    /** Replaces the Developer note the unit would otherwise get. */
    readonly note?: string;
    /** Declared on the German target instead of `translated`. */
    readonly state?: string;
    readonly maxwidth?: number;
    readonly alObjectTarget?: string;
    /** What an extension extends: the base object's type and name. */
    readonly target?: PathStep;
    /** Exempt from the file's untranslated pattern. */
    readonly keep?: boolean;
    /** The id, when it is not the path's names hashed: a readable, namespaced id. */
    readonly id?: string;
    /** The generator note, when it is not the path's names: a namespace, or a folded root. */
    readonly generatorNote?: string;
}

interface Unit extends Draft {
    readonly translated: boolean;
    readonly note: string;
}

type Role = 'base' | 'english' | 'german';

interface FileShape {
    readonly role: Role;
    readonly original: string;
    readonly declaration: string;
    readonly bom: boolean;
    readonly eol: string;
}

type Pair = readonly [string, string];
type NamedText = readonly [string, string, string];

const LF = '\n';
const CRLF = '\r\n';
const BOM = '\uFEFF';
const DECLARATION_LOWER = '<?xml version="1.0" encoding="utf-8"?>';
const DECLARATION_UPPER = '<?xml version="1.0" encoding="UTF-8"?>';
const XLIFF_OPEN = '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:tc:xliff:document:1.2 xliff-core-1.2-transitional.xsd">';

const MINIMAL = [
    DECLARATION_UPPER,
    '<xliff version="1.2">',
    '  <file source-language="en" target-language="de">',
    '    <body>',
    '      <trans-unit id="1">',
    '        <source>Hello World</source>',
    '        <target>Hallo Welt</target>',
    '      </trans-unit>',
    '    </body>',
    '  </file>',
    '</xliff>',
].join(LF);

/** [caption, German caption]. Several are the same word in both languages, as real captions are. */
const FIELDS: readonly Pair[] = [
    ['No.', 'Nr.'],
    ['Name', 'Name'],
    ['Description', 'Beschreibung'],
    ['Code', 'Code'],
    ['Status', 'Status'],
    ['Posting Date', 'Buchungsdatum'],
    ['Document No.', 'Belegnr.'],
    ['Amount', 'Betrag'],
    ['Quantity', 'Menge'],
    ['Unit Price', 'VK-Preis'],
    ['Location Code', 'Lagerortcode'],
    ['Bin Code', 'Lagerplatzcode'],
    ['Item No.', 'Artikelnr.'],
    ['Customer No.', 'Debitorennr.'],
    ['Vendor No.', 'Kreditorennr.'],
    ['E-Mail', 'E-Mail'],
    ['Phone No.', 'Telefonnr.'],
    ['Address', 'Adresse'],
    ['City', 'Ort'],
    ['Country/Region Code', 'Länder-/Regionscode'],
    ['Currency Code', 'Währungscode'],
    ['Blocked', 'Gesperrt'],
    ['Last Date Modified', 'Korrigiert am'],
    ['Weight', 'Gewicht'],
    ['Volume', 'Volumen'],
    ['Language Code', 'Sprachcode'],
    ['Payment Terms Code', 'Zlg.-Bedingungscode'],
    ['Shipment Date', 'Warenausgangsdatum'],
    ['External Document No.', 'Externe Belegnummer'],
    ['Comment', 'Bemerkung'],
    ['Enabled', 'Aktiviert'],
    ['Default', 'Standard'],
    ['Template Name', 'Vorlagenname'],
    ['Batch Name', 'Buch.-Blattname'],
    ['Line No.', 'Zeilennr.'],
    ['Entry No.', 'Lfd. Nr.'],
    ['Salesperson Code', 'Verkäufercode'],
    ['Route Code', 'Routencode'],
    ['Carrier Code', 'Spediteurcode'],
    ['Dock Door', 'Ladetor'],
];

/** [caption, German caption, tooltip, German tooltip]. */
const ACTIONS: readonly (readonly [string, string, string, string])[] = [
    ['Post', 'Buchen', 'Posts the selected documents.', 'Bucht die ausgewählten Belege.'],
    ['Print Labels', 'Etiketten drucken', 'Prints labels for the selected lines.', 'Druckt Etiketten für die ausgewählten Zeilen.'],
    ['Release', 'Freigeben', 'Releases the document for the next stage.', 'Gibt den Beleg für die nächste Stufe frei.'],
    ['Reopen', 'Erneut öffnen', 'Reopens the document for editing.', 'Öffnet den Beleg erneut zur Bearbeitung.'],
    ['Send to Relay', 'An Relay senden', 'Sends the record to the relay service.', 'Sendet den Datensatz an den Relay-Dienst.'],
    ['Recalculate', 'Neu berechnen', 'Recalculates the amounts.', 'Berechnet die Beträge neu.'],
    ['Show Log', 'Protokoll anzeigen', 'Shows the integration log.', 'Zeigt das Integrationsprotokoll an.'],
    ['Plan Route', 'Route planen', 'Plans the route for the selected stops.', 'Plant die Route für die ausgewählten Stopps.'],
    ['Weigh', 'Wiegen', 'Reads the weight from the scale.', 'Liest das Gewicht von der Waage.'],
    ['Book Dock Door', 'Ladetor buchen', 'Books a dock door for the shipment.', 'Bucht ein Ladetor für die Lieferung.'],
    ['Export', 'Exportieren', 'Exports the lines to a file.', 'Exportiert die Zeilen in eine Datei.'],
    ['Import', 'Importieren', 'Imports lines from a file.', 'Importiert Zeilen aus einer Datei.'],
];

/** [label name, text, German text]. Placeholders agree between the two. */
const LABELS: readonly NamedText[] = [
    ['PostQst', 'Do you want to post %1 %2?', 'Möchten Sie %1 %2 buchen?'],
    ['ReleasedMsg', '%1 %2 has been released.', '%1 %2 wurde freigegeben.'],
    ['BlankFieldErr', 'The %1 field must not be blank.', 'Das Feld %1 darf nicht leer sein.'],
    ['ProgressMsg', 'Processing %1 of %2...', 'Verarbeite %1 von %2...'],
    ['NothingToPostMsg', 'Nothing to post.', 'Es gibt nichts zu buchen.'],
    ['AmountErr', 'The amount must be > 0.', 'Der Betrag muss > 0 sein.'],
    ['ContinueMsg', 'Press <Enter> to continue.', 'Drücken Sie <Eingabe>, um fortzufahren.'],
    ['TermsLbl', 'Terms & Conditions', 'Geschäftsbedingungen & Konditionen'],
    ['PrintedMsg', '%1 labels were printed.', '%1 Etiketten wurden gedruckt.'],
    ['RouteBlockedErr', 'Route %1 is blocked.', 'Route %1 ist gesperrt.'],
    ['UnreachableErr', 'Could not reach %1. Error: %2', '%1 konnte nicht erreicht werden. Fehler: %2'],
    ['DeleteQst', 'Do you want to delete %1?', 'Möchten Sie %1 löschen?'],
    ['WeightErr', 'Weight %1 exceeds the limit of %2.', 'Gewicht %1 überschreitet das Limit von %2.'],
    ['SyncDoneMsg', 'Synchronization finished.', 'Synchronisierung abgeschlossen.'],
    ['SelectCarrierMsg', 'Select a carrier first.', 'Wählen Sie zuerst einen Spediteur aus.'],
    ['PlannedMsg', '%1 of %2 stops were planned.', '%1 von %2 Stopps wurden geplant.'],
];

const REPORT_LABELS: readonly NamedText[] = [
    ['PageLbl', 'Page', 'Seite'],
    ['TotalLbl', 'Total', 'Gesamt'],
    ['DateLbl', 'Date', 'Datum'],
    ['NoLbl', 'No.', 'Nr.'],
    ['DescriptionLbl', 'Description', 'Beschreibung'],
    ['AmountLbl', 'Amount', 'Betrag'],
    ['QuantityLbl', 'Quantity', 'Menge'],
    ['SignatureLbl', 'Signature', 'Unterschrift'],
    ['ContinuedLbl', 'Continued', 'Fortsetzung'],
];

const STATUS_VALUES: readonly Pair[] = [['Open', 'Offen'], ['In Progress', 'In Bearbeitung'], ['Done', 'Erledigt'], ['Blocked', 'Gesperrt'], ['Cancelled', 'Storniert']];
const PRIORITY_VALUES: readonly Pair[] = [['Low', 'Niedrig'], ['Normal', 'Normal'], ['High', 'Hoch'], ['Urgent', 'Dringend'], ['Critical', 'Kritisch']];
const EXTENSION_VALUES: readonly Pair[] = [['Relay', 'Relay'], ['Pallet', 'Palette'], ['Dock', 'Ladetor']];

const METHODS: readonly string[] = ['Run', 'Post', 'Validate', 'Send', 'Print', 'Calculate', 'Initialize', 'Check'];

const WORDS: Readonly<Record<string, string>> = {
    Activity: 'Aktivität', Agreement: 'Vereinbarung', Archive: 'Archiv', Batch: 'Stapel', Booking: 'Buchung',
    Branch: 'Filiale', Buffer: 'Puffer', Calibration: 'Kalibrierung', Card: 'Karte', Carrier: 'Spediteur',
    Check: 'Prüfung', Class: 'Klasse', Confirmation: 'Bestätigung', Daily: 'Tägliche', Direction: 'Richtung',
    Dispatch: 'Disposition', Dock: 'Ladetor', Door: 'Tor', Entries: 'Posten', Entry: 'Posten', Errors: 'Fehler',
    Hazard: 'Gefahrgut', Inventory: 'Inventur', Label: 'Etikett', Ledger: 'Buch', Level: 'Stufe', Line: 'Zeile',
    Lines: 'Zeilen', List: 'Liste', Log: 'Protokoll', Message: 'Nachricht', Messages: 'Nachrichten',
    Methods: 'Methoden', Note: 'Schein', Order: 'Auftrag', Overview: 'Übersicht', Pallet: 'Palette',
    Performance: 'Leistung', Print: 'Druck', Priority: 'Priorität', Scale: 'Waage', Schedule: 'Zeitplan',
    Setup: 'Einrichtung', Shift: 'Schicht', Shipment: 'Lieferung', Statement: 'Auszug', Stock: 'Bestand',
    Stop: 'Stopp', Stops: 'Stopps', Subform: 'Unterformular', Summary: 'Übersicht', Tariff: 'Tarif',
    Tariffs: 'Tarife', Temperature: 'Temperatur', Template: 'Vorlage', Ticket: 'Beleg', Transfer: 'Umlagerung',
    Type: 'Art', Unit: 'Einheit', Utilization: 'Auslastung', Vehicle: 'Fahrzeug', Weekday: 'Wochentag',
    Weighing: 'Wiege',
};

const PLACEHOLDER_ROLES: readonly string[] = ['%1 = Record', '%2 = Value', '%3 = Limit', '%4 = Error'];

/** The path as the generator note writes it: types and names. */
function namesOf(path: readonly PathStep[]): string {
    return path.map(each => `${each.type} ${each.name}`).join(' - ');
}

const segment = (type: string, name: string): PathStep => ({ type, name });
const property = (name: string): PathStep => segment('Property', name);
const toGerman = (text: string): string => text.split(' ').map(word => WORDS[word] ?? word).join(' ');

function at<T>(list: readonly T[], index: number): T {
    return list[index % list.length];
}

/** A description of the placeholders, the way a developer documents a label; undefined when it has none. */
function placeholderNote(text: string): string | undefined {
    const count = new Set(text.match(/%\d/g)).size;
    return count === 0 ? undefined : PLACEHOLDER_ROLES.slice(0, count).join(', ');
}

function caption(path: readonly PathStep[], english: string, german: string, extra: Partial<Draft> = {}): Draft {
    return { path: [...path, property('Caption')], source: english, german, ...extra };
}

function toolTip(path: readonly PathStep[], english: string, german: string, extra: Partial<Draft> = {}): Draft {
    return { path: [...path, property('ToolTip')], source: english, german, ...extra };
}

function label(path: readonly PathStep[], [name, english, german]: NamedText, extra: Partial<Draft> = {}): Draft {
    return { path: [...path, segment('NamedType', name)], source: english, german, note: placeholderNote(english), ...extra };
}

function table(name: string, fields: number, offset: number): Draft[] {
    const root = [segment('Table', name)];
    return [
        caption(root, name, toGerman(name)),
        ...Array.from({ length: fields }, (_, index) => {
            const [english, german] = at(FIELDS, offset + index);
            return caption([...root, segment('Field', english)], english, german);
        }),
    ];
}

function tableExtension(base: string, offset: number): Draft[] {
    const root = [segment('TableExtension', `Fabrikam ${base} Ext.`)];
    const alObjectTarget = `Table ${alNameHash(base)}`;
    return Array.from({ length: 5 }, (_, index) => {
        const [english, german] = at(FIELDS, offset + index);
        return caption([...root, segment('Field', `Fabrikam ${english}`)], english, german, { alObjectTarget, target: segment('Table', base) });
    });
}

/** The caption a page gives its last control, when it is not the field's own. */
interface SpecialCaption {
    readonly source: string;
    readonly german: string;
    readonly keep?: boolean;
}

interface PageShape {
    readonly type: 'Page' | 'PageExtension';
    readonly controls: number;
    readonly offset: number;
    readonly withCaption: boolean;
    readonly actions: number;
    readonly withActionLabel: boolean;
    readonly alObjectTarget?: string;
    /** The page an extension extends. */
    readonly target?: string;
    readonly lastCaption?: (english: string, german: string) => SpecialCaption;
}

function page(name: string, shape: PageShape): Draft[] {
    const root = [segment(shape.type, name)];
    const target: Partial<Draft> = shape.target === undefined ? {} : { target: segment('Page', shape.target) };
    const extra: Partial<Draft> = shape.alObjectTarget === undefined ? target : { ...target, alObjectTarget: shape.alObjectTarget };
    // A label declared in an extension names the extension itself, not the page it extends.
    const labelExtra: Partial<Draft> = shape.alObjectTarget === undefined ? target : { ...target, alObjectTarget: `${shape.type} ${alNameHash(name)}` };
    const drafts: Draft[] = shape.withCaption ? [caption(root, name, toGerman(name), extra)] : [];

    for (let index = 0; index < shape.controls; index++) {
        const [english, german] = at(FIELDS, shape.offset + index);
        const control = [...root, segment('Control', identifier(english))];
        const special = index === shape.controls - 1 ? shape.lastCaption?.(english, german) : undefined;
        drafts.push(special === undefined
            ? caption(control, english, german, extra)
            : caption(control, special.source, special.german, { ...extra, keep: special.keep }));
        drafts.push(toolTip(control, `Specifies the value of the ${english} field.`, `Gibt den Wert des Felds ${german} an.`, extra));
    }

    for (let index = 0; index < shape.actions; index++) {
        const [english, german, tip, germanTip] = at(ACTIONS, shape.offset + index);
        const action = [...root, segment('Action', identifier(english))];
        drafts.push(caption(action, english, german, extra));
        drafts.push(toolTip(action, tip, germanTip, extra));
        if (shape.withActionLabel && index === 0) {
            drafts.push(label([...action, segment('Method', 'OnAction')], at(LABELS, shape.offset), labelExtra));
        }
    }
    return drafts;
}

function codeunit(name: string, methods: number, labels: number, offset: number): Draft[] {
    const root = [segment('Codeunit', name)];
    return Array.from({ length: methods }, (_, method) => {
        const path = [...root, segment('Method', at(METHODS, offset + method))];
        return Array.from({ length: labels }, (__, index) => label(path, at(LABELS, offset + method * labels + index)));
    }).flat();
}

function report(name: string, labels: number, offset: number): Draft[] {
    const root = [segment('Report', name)];
    return [
        caption(root, name, toGerman(name)),
        ...Array.from({ length: labels }, (_, index): Draft => {
            const [labelName, english, german] = at(REPORT_LABELS, offset + index);
            return { path: [...root, segment('ReportLabel', labelName)], source: english, german };
        }),
    ];
}

function xmlPort(name: string, offset: number): Draft[] {
    const root = [segment('XmlPort', name)];
    return [
        caption(root, name, toGerman(name)),
        ...Array.from({ length: 3 }, (_, index) => label(root, at(LABELS, offset + index))),
    ];
}

function enumeration(name: string, values: readonly Pair[], count: number): Draft[] {
    return values.slice(0, count).map(([english, german]) => caption([segment('Enum', name), segment('EnumValue', english)], english, german));
}

function enumExtension(base: string): Draft[] {
    const root = [segment('EnumExtension', `Fabrikam ${base} Ext.`)];
    const alObjectTarget = `Enum ${alNameHash(base)}`;
    return EXTENSION_VALUES.map(([english, german]) => caption([...root, segment('EnumValue', english)], english, german, { alObjectTarget, target: segment('Enum', base) }));
}

/** Two names with one hash would merge into one tree node, and two units with one id would be one unit. */
function assertDistinct(units: readonly Unit[]): void {
    const names = new Map<string, string>();
    const ids = new Set<string>();
    for (const unit of units) {
        for (const each of unit.path) {
            const key = `${each.type} ${alNameHash(each.name)}`;
            const known = names.get(key);
            if (known !== undefined && known !== each.name) {
                throw new Error(`"${known}" and "${each.name}" hash alike as ${each.type}`);
            }
            names.set(key, each.name);
        }
        const id = unit.id ?? hashedIdOf(unit.path);
        if (ids.has(id)) {
            throw new Error(`two units share the id ${id}`);
        }
        ids.add(id);
    }
}

/** An empty source cannot be translated; `keep` exempts a unit from the file's untranslated pattern. */
function finish(drafts: readonly Draft[], untranslated: (index: number) => boolean): Unit[] {
    const units = drafts.map((draft, index): Unit => ({
        ...draft,
        translated: draft.source !== '' && (draft.keep === true || !untranslated(index)),
        note: draft.note ?? (index % 9 === 4 || draft.german === '' ? '' : `de-DE=${draft.german}`),
    }));
    assertDistinct(units);
    return units;
}

const CONTOSO_TABLES = [
    'Contoso Setup', 'Contoso Methods Setup', 'Contoso Region', 'Contoso Branch', 'Contoso Tariff',
    'Contoso Tariff Line', 'Contoso Agreement', 'Contoso Agreement Line', 'Contoso Ledger Entry', 'Contoso Archive',
];
/** The first two share their table's name, and so its hash, as a setup page and its table do. */
const CONTOSO_PAGES = [
    'Contoso Setup', 'Contoso Methods Setup', 'Contoso Region List', 'Contoso Branch Card', 'Contoso Tariffs',
    'Contoso Tariff Lines', 'Contoso Agreement Card', 'Contoso Agreement Subform', 'Contoso Ledger Entries', 'Contoso Archive List',
];
const CONTOSO_CODEUNITS = [
    'Contoso Mgt.', 'Contoso Tariff Mgt.', 'Contoso Agreement Mgt.', 'Contoso Posting', 'Contoso Archive Mgt.',
    'Contoso Install', 'Contoso Upgrade', 'Contoso Subscribers', 'Contoso Notifications', 'Contoso Export',
];
const CONTOSO_ENUMS = [
    'Contoso Tariff Type', 'Contoso Agreement Status', 'Contoso Region Type', 'Contoso Branch Type', 'Contoso Archive Reason',
    'Contoso Priority', 'Contoso Channel', 'Contoso Interval', 'Contoso Rounding', 'Contoso Level',
];
const CONTOSO_REPORTS = ['Contoso Tariff - List', 'Contoso Agreement - Print', 'Contoso Ledger Summary', 'Contoso Branch Overview', 'Contoso Archive - Export'];

/** Where the German file departs from `translated`, on targets that still have text. */
const CONTOSO_OUTLIERS = new Map<number, string>([[123, 'needs-translation'], [321, 'needs-adaptation']]);

/** 500 units: ten tables, ten pages, ten codeunits, ten enums and five reports. */
function contoso(): Unit[] {
    const drafts = [
        ...CONTOSO_TABLES.flatMap((name, index) => table(name, 9, index * 3)),
        ...CONTOSO_PAGES.flatMap((name, index) => page(name, { type: 'Page', controls: 8, offset: index * 4, withCaption: true, actions: 1, withActionLabel: true })),
        ...CONTOSO_CODEUNITS.flatMap((name, index) => codeunit(name, 2, 5, index)),
        ...CONTOSO_ENUMS.flatMap((name, index) => enumeration(name, index % 2 === 0 ? STATUS_VALUES : PRIORITY_VALUES, 5)),
        ...CONTOSO_REPORTS.flatMap((name, index) => report(name, 9, index)),
    ];
    return finish(drafts.map((draft, index): Draft => ({ ...draft, state: CONTOSO_OUTLIERS.get(index) })), () => false);
}

const FABRIKAM_TABLES = [
    'Fabrikam Setup', 'Fabrikam Relay Setup', 'Fabrikam Route', 'Fabrikam Route Stop', 'Fabrikam Carrier',
    'Fabrikam Carrier Service', 'Fabrikam Shipment Buffer', 'Fabrikam Label Template', 'Fabrikam Scale', 'Fabrikam Weighing Entry',
    'Fabrikam Pallet', 'Fabrikam Pallet Line', 'Fabrikam Dock Door', 'Fabrikam Dock Booking', 'Fabrikam Activity Log',
    'Fabrikam Integration Log',
];
/** The first eight share their table's name, and so its hash. */
const FABRIKAM_PAGES = [
    ...FABRIKAM_TABLES.slice(0, 8),
    ...FABRIKAM_TABLES.map(name => `${name} List`),
    ...FABRIKAM_TABLES.map(name => `${name} Card`),
];
const BASE_TABLES = [
    'Customer', 'Vendor', 'Item', 'Sales Header', 'Sales Line', 'Purchase Header', 'Purchase Line', 'Location',
    'Shipping Agent', 'Warehouse Shipment Header', 'Warehouse Shipment Line', 'Transfer Header', 'Transfer Line',
    'Sales Shipment Header', 'Sales Invoice Header', 'Purch. Rcpt. Header', 'Item Journal Line', 'Bin', 'Contact', 'Ship-to Address',
];
const BASE_PAGES = [
    'Customer Card', 'Customer List', 'Vendor Card', 'Vendor List', 'Item Card', 'Item List', 'Sales Order', 'Sales Order List',
    'Sales Quote', 'Sales Invoice', 'Sales Credit Memo', 'Purchase Order', 'Purchase Invoice', 'Purchase Credit Memo',
    'Transfer Order', 'Warehouse Shipment', 'Warehouse Receipt', 'Warehouse Pick', 'Posted Sales Invoice', 'Posted Sales Shipment',
    'Posted Purchase Receipt', 'Item Journal', 'Location Card', 'Bin Contents', 'Production Order', 'Service Order',
    'Contact Card', 'Ship-to Address', 'Shipping Agents', 'Sales & Receivables Setup',
];
const FABRIKAM_REPORTS = [
    'Fabrikam Order - Confirmation', 'Fabrikam Stock - Transfer Note', 'Fabrikam Route - Plan', 'Fabrikam Pallet - Label',
    'Fabrikam Shipment - Manifest', 'Fabrikam Dock - Schedule', 'Fabrikam Weighing - Ticket', 'Fabrikam Carrier - Statement',
    'Fabrikam Activity Summary', 'Fabrikam Integration Errors', 'Fabrikam Daily Dispatch', 'Fabrikam Route Stops',
    'Fabrikam Label Batch', 'Fabrikam Scale Calibration', 'Fabrikam Pallet Inventory', 'Fabrikam Dock Utilization',
    'Fabrikam Carrier Performance', 'Fabrikam Relay Messages', 'Fabrikam Setup Overview', 'Fabrikam Shipment Buffer Check',
];
const FABRIKAM_CODEUNITS = ['Relay', 'Route', 'Carrier', 'Label', 'Scale', 'Pallet', 'Dock', 'Integration']
    .flatMap(subject => ['Mgt.', 'Handler', 'Subscribers', 'Install', 'Upgrade'].map(role => `Fabrikam ${subject} ${role}`));
const LABEL_CODEUNIT = 'Fabrikam Label Mgt.';
const FABRIKAM_XMLPORTS = ['Fabrikam Route Import', 'Fabrikam Stop Export', 'Fabrikam Carrier Import', 'Fabrikam Label Export'];
const FABRIKAM_ENUMS = [
    'Fabrikam Relay Status', 'Fabrikam Route Type', 'Fabrikam Stop Type', 'Fabrikam Carrier Type', 'Fabrikam Service Level',
    'Fabrikam Label Format', 'Fabrikam Scale Unit', 'Fabrikam Pallet Type', 'Fabrikam Dock Type', 'Fabrikam Booking Status',
    'Fabrikam Log Level', 'Fabrikam Message Type', 'Fabrikam Direction', 'Fabrikam Priority', 'Fabrikam Weekday',
    'Fabrikam Shift', 'Fabrikam Zone', 'Fabrikam Vehicle Type', 'Fabrikam Hazard Class', 'Fabrikam Temperature Class',
];
const BASE_ENUMS = [
    'Sales Line Type', 'Purchase Line Type', 'Item Type', 'Warehouse Activity Type', 'Shipment Method Type',
    'Reservation Status', 'Transfer Route Type', 'Service Item Status', 'Contact Type', 'Bin Ranking',
];

/**
 * Thirty labels in six methods, and among them every case a label can be: a `maxwidth`, a
 * note naming two languages, each placeholder used twice, a placeholder the translation
 * lost, and a URL whose `&` the file has to escape.
 */
function labelCodeunit(): Draft[] {
    const root = [segment('Codeunit', LABEL_CODEUNIT)];
    const method = (name: string): PathStep[] => [...root, segment('Method', name)];
    const ordinary = (name: string, count: number, offset: number): Draft[] =>
        Array.from({ length: count }, (_, index) => label(method(name), at(LABELS, offset + index)));
    const url = 'https://relay.fabrikam.example/api?sv=2024-05-04&sig=Q29udG9zbw';
    return [
        label(method('GetNoneText'), ['NoneLbl', 'none', 'keine'], { maxwidth: 50, note: 'de-DE=keine|en-US=none', keep: true }),
        ...ordinary('GetNoneText', 4, 0),
        label(method('FormatRange'), ['RangeTxt', 'From %1 %2 to %3 %4', 'Von %1 %2 bis %3 %4 (%1 %2 bis %3 %4)'], { keep: true }),
        ...ordinary('FormatRange', 4, 4),
        label(method('CheckCarrier'), ['NoServiceErr', 'Carrier %1 has no service %2.', 'Spediteur %1 hat keinen Service.'], { keep: true }),
        ...ordinary('CheckCarrier', 4, 8),
        label(method('GetRelayUrl'), ['RelayUrlTxt', url, url], { keep: true }),
        ...ordinary('GetRelayUrl', 4, 12),
        ...ordinary('PrintBatch', 5, 2),
        ...ordinary('ResetCounters', 5, 9),
    ];
}

/**
 * The last control of some pages: an empty caption on the first eight, a single space on the
 * next ten, then a trailing space the translation keeps on five and drops on two.
 */
function lastCaption(index: number): PageShape['lastCaption'] {
    if (index < 8) {
        return () => ({ source: '', german: '' });
    }
    if (index < 18) {
        return () => ({ source: ' ', german: ' ', keep: true });
    }
    if (index < 23) {
        return (english, german) => ({ source: `${english} `, german: `${german} ` });
    }
    if (index < 25) {
        return (english, german) => ({ source: `${english} `, german, keep: true });
    }
    return undefined;
}

/** 2500 units under 230 objects of nine types, with every seventh unit still untranslated. */
function fabrikam(): Unit[] {
    const drafts = [
        ...FABRIKAM_TABLES.flatMap((name, index) => table(name, 11, index * 2)),
        ...BASE_TABLES.flatMap((base, index) => tableExtension(base, index)),
        ...FABRIKAM_PAGES.flatMap((name, index) => page(name, {
            type: 'Page', controls: 9, offset: index, withCaption: true, actions: 2, withActionLabel: false, lastCaption: lastCaption(index),
        })),
        // Each extension has a page of its own: AL files two extensions of one page under one of them.
        ...BASE_PAGES.flatMap((base, index) => [base, `${base} FactBox`].flatMap((target, variant) => page(`Fabrikam ${target} Ext.`, {
            type: 'PageExtension', controls: 4, offset: index * 2 + variant, withCaption: false, actions: 1, withActionLabel: true,
            alObjectTarget: `Page ${alNameHash(target)}`, target,
        }))),
        ...FABRIKAM_REPORTS.flatMap((name, index) => report(name, 6, index)),
        ...FABRIKAM_CODEUNITS.flatMap((name, index) => (name === LABEL_CODEUNIT ? labelCodeunit() : codeunit(name, 2, 4, index))),
        ...FABRIKAM_XMLPORTS.flatMap((name, index) => xmlPort(name, index * 3)),
        ...FABRIKAM_ENUMS.flatMap((name, index) => enumeration(name, index % 2 === 0 ? STATUS_VALUES : PRIORITY_VALUES, 5)),
        ...BASE_ENUMS.flatMap(base => enumExtension(base)),
    ];
    return finish(drafts, index => index % 7 === 3);
}

/** The namespaced app, with one target left untranslated. */
function northwind(): Unit[] {
    const drafts = appUnits(NORTHWIND).map((unit): Draft => ({
        path: unit.path,
        source: unit.source,
        german: unit.german,
        note: unit.developerNote,
        maxwidth: unit.maxwidth,
        alObjectTarget: unit.alObjectTarget,
        id: unit.id,
        generatorNote: unit.generatorNote,
    }));
    return finish(drafts, index => index === 6);
}

interface MethodDraft {
    readonly kind: 'trigger' | 'procedure';
    readonly name: string;
    readonly labels: AlLabel[];
}

interface MemberDraft {
    readonly kind: string;
    readonly name: string;
    readonly properties: AlProperty[];
    readonly methods: MethodDraft[];
}

interface ObjectDraft {
    readonly kind: string;
    readonly id: number;
    readonly name: string;
    readonly extends?: { readonly kind: string; readonly name: string };
    readonly properties: AlProperty[];
    readonly members: MemberDraft[];
    readonly labels: AlLabel[];
    readonly methods: MethodDraft[];
    readonly reportLabels: AlLabel[];
}

function findOrAdd<T extends { readonly kind: string; readonly name: string }>(list: T[], kind: string, name: string, create: () => T): T {
    const found = list.find(each => each.kind === kind && each.name === name);
    if (found !== undefined) {
        return found;
    }
    const created = create();
    list.push(created);
    return created;
}

/**
 * The corpus's units as the objects that declare them, so AL source can be written for them.
 *
 * Every fifth table-field caption becomes one the compiler synthesises — its source is the
 * field's name, which is what the compiler would take — so the source has no line for it.
 */
function appOf(name: string, units: readonly Unit[]): AlApp {
    const objects = new Map<string, ObjectDraft>();
    let nextId = 50000;
    let tableFields = 0;

    for (const unit of units) {
        const [root, ...rest] = unit.path;
        const key = `${root.type} ${root.name}`;
        let object = objects.get(key);
        if (object === undefined) {
            object = {
                kind: root.type, id: nextId++, name: root.name,
                properties: [], members: [], labels: [], methods: [], reportLabels: [],
                ...(unit.target === undefined ? {} : { extends: { kind: unit.target.type, name: unit.target.name } }),
            };
            objects.set(key, object);
        }

        const last = rest.at(-1);
        if (last === undefined) {
            continue;
        }
        const text: AlLabel = { name: last.name, source: unit.source, german: unit.german, ...(unit.maxwidth === undefined ? {} : { maxLength: unit.maxwidth }) };

        if (rest.length === 1) {
            if (last.type === 'Property') {
                object.properties.push({ name: last.name, source: unit.source, german: unit.german });
            } else if (last.type === 'ReportLabel') {
                object.reportLabels.push(text);
            } else {
                object.labels.push(text);
            }
        } else if (rest.length === 2 && rest[0].type === 'Method') {
            findOrAdd(object.methods, 'procedure', rest[0].name, (): MethodDraft => ({ kind: 'procedure', name: rest[0].name, labels: [] })).labels.push(text);
        } else if (rest.length === 2) {
            const [container] = rest;
            const member = findOrAdd(object.members, container.type, container.name, () => ({ kind: container.type, name: container.name, properties: [], methods: [] }));
            const synthesized = root.type === 'Table' && container.type === 'Field' && last.name === 'Caption' && tableFields++ % 5 === 3;
            member.properties.push({ name: last.name, source: unit.source, german: unit.german, ...(synthesized ? { synthesized } : {}) });
        } else {
            const [container, method] = rest;
            const member = findOrAdd(object.members, container.type, container.name, () => ({ kind: container.type, name: container.name, properties: [], methods: [] }));
            findOrAdd(member.methods, 'trigger', method.name, (): MethodDraft => ({ kind: 'trigger', name: method.name, labels: [] })).labels.push(text);
        }
    }

    return { name, namespacedIds: false, objects: [...objects.values()] };
}

/** `Contoso App` as the AL objects that declare its units. */
export function contosoApp(): AlApp {
    return appOf('Contoso App', contoso());
}

/** `Fabrikam Base` as the AL objects that declare its units — rendered in memory only. */
export function fabrikamApp(): AlApp {
    return appOf('Fabrikam Base', fabrikam());
}

export const CONTOSO_MANIFEST: AppManifest = { id: '5c0e7a10-0000-4000-8000-00000000c0a1', publisher: 'Contoso', features: ['TranslationFile'] };
export const NORTHWIND_MANIFEST: AppManifest = {
    id: '5c0e7a10-0000-4000-8000-000000004e71',
    publisher: 'Northwind',
    features: ['TranslationFile', 'GenerateCaptions', 'TranslationsWithNamespaces'],
};

/** Where the committed AL sources live, per app, under `src/test/fixtures/al/`. */
export const FABRIKAM_MANIFEST: AppManifest = { id: '5c0e7a10-0000-4000-8000-00000000fab1', publisher: 'Fabrikam', features: ['TranslationFile'] };

export const AL_APPS = {
    contoso: 'Contoso App',
    namespaced: 'Northwind App',
} as const;

/** An app the corpus has AL source for, and the translation file of it the tests read. */
export interface CorpusApp {
    readonly name: string;
    readonly app: AlApp;
    readonly manifest: AppManifest;
    readonly xliff: string;
}

/** Every app with AL source: the two committed ones, and Fabrikam's, rendered in memory. */
export function corpusApps(): readonly CorpusApp[] {
    return [
        { name: AL_APPS.contoso, app: contosoApp(), manifest: CONTOSO_MANIFEST, xliff: FIXTURE.base },
        { name: AL_APPS.namespaced, app: NORTHWIND, manifest: NORTHWIND_MANIFEST, xliff: FIXTURE.namespacedBase },
        { name: 'Fabrikam Base', app: fabrikamApp(), manifest: FABRIKAM_MANIFEST, xliff: FIXTURE.large },
    ];
}

/** What an app's translation files hold, counted from the units they are written from. */
export interface CorpusFacts {
    readonly units: number;
    /** Written with a German target in the state `translated`. */
    readonly translated: number;
    /** Written with an empty `needs-translation` target. */
    readonly untranslated: number;
    readonly withObjectTarget: number;
    /** The distinct roots of the hashed ids. */
    readonly rootObjects: number;
    readonly objectTypes: number;
}

function factsOf(units: readonly Unit[]): CorpusFacts {
    return {
        units: units.length,
        translated: units.filter(unit => unit.translated && (unit.state ?? 'translated') === 'translated').length,
        untranslated: units.filter(unit => !unit.translated).length,
        withObjectTarget: units.filter(unit => unit.alObjectTarget !== undefined).length,
        rootObjects: new Set(units.map(unit => hashedIdOf(unit.path.slice(0, 1)))).size,
        objectTypes: new Set(units.map(unit => unit.path[0].type)).size,
    };
}

let facts: Readonly<Record<'contoso' | 'large' | 'namespaced', CorpusFacts>> | undefined;

/** The facts of each app, generated once: Contoso's three files, Fabrikam's and Northwind's two. */
export function corpusFacts(): Readonly<Record<'contoso' | 'large' | 'namespaced', CorpusFacts>> {
    facts ??= { contoso: factsOf(contoso()), large: factsOf(fabrikam()), namespaced: factsOf(northwind()) };
    return facts;
}

/** The committed AL sources: every file of both apps, `app.json` included, by path. */
export function generateAlSources(): readonly FixtureFile[] {
    return [
        ...renderApp(contosoApp(), CONTOSO_MANIFEST).files.map(file => ({ name: `${AL_APPS.contoso}/${file.path}`, text: file.text })),
        ...renderApp(NORTHWIND, NORTHWIND_MANIFEST).files.map(file => ({ name: `${AL_APPS.namespaced}/${file.path}`, text: file.text })),
    ];
}

/** Fabrikam's objects, spread over three namespaces by their type. */
const FABRIKAM_NAMESPACES: Readonly<Record<string, string>> = {
    Table: 'Fabrikam.Data', TableExtension: 'Fabrikam.Data', Enum: 'Fabrikam.Data', EnumExtension: 'Fabrikam.Data',
    Page: 'Fabrikam.Interface', PageExtension: 'Fabrikam.Interface', Report: 'Fabrikam.Interface',
};

/**
 * `Fabrikam Base.de-DE.xlf` as it would be compiled with namespaced ids — generated in
 * memory, for the payload and speed a file of that size costs in this form.
 */
export function generateNamespacedFabrikam(): string {
    const units = fabrikam().map((unit): Unit => {
        const namespace = FABRIKAM_NAMESPACES[unit.path[0].type] ?? 'Fabrikam.Logic';
        return {
            ...unit,
            id: [`Namespace ${namespace}`, ...unit.path.map(each => `${each.type} ${quoteNameIfNeeded(each.name)}`)].join(' - '),
            generatorNote: `Namespace ${namespace} - ${namesOf(unit.path)}`,
        };
    });
    return render(units, { role: 'german', original: 'Fabrikam Base', declaration: DECLARATION_UPPER, bom: false, eol: LF });
}

function escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A readable id can carry a quoted name, and an attribute value is delimited by quotes. */
function escapeAttribute(value: string): string {
    return escapeText(value).replace(/"/g, '&quot;');
}

function leaf(tag: string, attributes: string, value: string): string {
    return value === '' ? `          <${tag}${attributes}/>` : `          <${tag}${attributes}>${escapeText(value)}</${tag}>`;
}

function targetOf(unit: Unit, role: Role): string | undefined {
    switch (role) {
        case 'base':
            return undefined;
        case 'english':
            return leaf('target', ' state="translated"', unit.source);
        case 'german':
            return unit.translated
                ? leaf('target', ` state="${unit.state ?? 'translated'}"`, unit.german)
                : leaf('target', ' state="needs-translation"', '');
    }
}

function renderUnit(unit: Unit, role: Role): string[] {
    const attributes = [`id="${escapeAttribute(unit.id ?? hashedIdOf(unit.path))}"`];
    if (unit.maxwidth !== undefined) {
        attributes.push(`maxwidth="${unit.maxwidth}"`);
    }
    attributes.push('size-unit="char"', 'translate="yes"', 'xml:space="preserve"');
    if (unit.alObjectTarget !== undefined) {
        attributes.push(`al-object-target="${escapeAttribute(unit.alObjectTarget)}"`);
    }
    const target = targetOf(unit, role);
    return [
        `        <trans-unit ${attributes.join(' ')}>`,
        leaf('source', '', unit.source),
        ...(target === undefined ? [] : [target]),
        leaf('note', ' from="Developer" annotates="general" priority="2"', unit.note),
        leaf('note', ' from="Xliff Generator" annotates="general" priority="3"', unit.generatorNote ?? namesOf(unit.path)),
        '        </trans-unit>',
    ];
}

function render(units: readonly Unit[], shape: FileShape): string {
    const targetLanguage = shape.role === 'german' ? 'de-DE' : 'en-US';
    const lines = [
        shape.declaration,
        XLIFF_OPEN,
        `  <file datatype="xml" source-language="en-US" target-language="${targetLanguage}" original="${shape.original}">`,
        '    <body>',
        '      <group id="body">',
        ...units.flatMap(unit => renderUnit(unit, shape.role)),
        '      </group>',
        '    </body>',
        '  </file>',
        '</xliff>',
    ];
    return (shape.bom ? BOM : '') + lines.join(shape.eol);
}

export function generateCorpus(): readonly FixtureFile[] {
    const app = contoso();
    const large = fabrikam();
    const namespaced = northwind();
    return [
        { name: FIXTURE.base, text: render(app, { role: 'base', original: 'Contoso App', declaration: DECLARATION_LOWER, bom: true, eol: CRLF }) },
        { name: FIXTURE.english, text: render(app, { role: 'english', original: 'Contoso App', declaration: DECLARATION_UPPER, bom: false, eol: LF }) },
        { name: FIXTURE.german, text: render(app, { role: 'german', original: 'Contoso App', declaration: DECLARATION_UPPER, bom: false, eol: LF }) },
        { name: FIXTURE.large, text: render(large, { role: 'german', original: 'Fabrikam Base', declaration: DECLARATION_UPPER, bom: false, eol: LF }) },
        { name: FIXTURE.minimal, text: MINIMAL },
        { name: FIXTURE.namespacedBase, text: render(namespaced, { role: 'base', original: 'Northwind App', declaration: DECLARATION_LOWER, bom: true, eol: CRLF }) },
        { name: FIXTURE.namespacedGerman, text: render(namespaced, { role: 'german', original: 'Northwind App', declaration: DECLARATION_UPPER, bom: false, eol: LF }) },
    ];
}

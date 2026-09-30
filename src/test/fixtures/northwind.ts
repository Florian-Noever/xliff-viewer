/**
 * `Northwind App`: an invented app compiled with namespaced ids.
 *
 * Small, and chosen for what it covers rather than for size:
 *
 * - readable ids, and a name containing the separator, which the id has to quote;
 * - two objects of one type and one name, in two namespaces;
 * - objects without a namespace, beside objects with one;
 * - a non-ASCII field name and an over-long id, each of which makes the compiler hash that
 *   one id — so one object appears in both forms in the same file;
 * - an API procedure, whose caption is filed under its all-digit method id;
 * - an extension of an object in the same app, and two extensions of one outside object,
 *   both of which the compiler files under another object than the one that declares them.
 */

import type { AlApp, AlLabel, AlProperty } from './alApp';

const caption = (source: string, german: string): AlProperty => ({ name: 'Caption', source, german });
const toolTip = (source: string, german: string): AlProperty => ({ name: 'ToolTip', source, german });
const label = (name: string, source: string, german: string): AlLabel => ({ name, source, german });

const LONG_NAMESPACE = 'Northwind.Logistics.Warehousing.Outbound.Shipping.Documents.Printing.Templates.Configuration.Validation.Rules';
const LONG_PROCEDURE = 'ValidateOutboundShipmentDocumentPrintTemplateConfigurationBeforeReleasingTheWarehouseShipmentToTheCarrierForDispatch';
const LONG_LABEL = 'OutboundShipmentDocumentPrintTemplateConfigurationIsMissingForTheSelectedLocationAndShippingAgentServiceCombinationErr';

export const NORTHWIND: AlApp = {
    name: 'Northwind App',
    namespacedIds: true,
    objects: [
        {
            kind: 'Table', id: 70000, name: 'Northwind Setup', namespace: 'Northwind.Common',
            properties: [caption('Northwind Setup', 'Northwind-Einrichtung')],
            members: [
                { kind: 'Field', name: 'Primary Key', properties: [caption('Primary Key', 'Primärschlüssel')] },
                {
                    kind: 'Field', name: 'Order Nos.',
                    properties: [caption('Order Nos.', 'Auftragsnummern'), toolTip('Specifies the number series for orders.', 'Gibt die Nummernserie für Aufträge an.')],
                },
            ],
        },
        {
            kind: 'Table', id: 70001, name: 'Northwind Order', namespace: 'Northwind.Sales',
            properties: [caption('Northwind Order', 'Northwind-Auftrag')],
            members: [
                { kind: 'Field', name: 'No.', properties: [caption('No.', 'Nr.')] },
                {
                    kind: 'Field', name: 'Customer No.',
                    properties: [caption('Customer No.', 'Debitorennr.'), toolTip('Specifies the customer.', 'Gibt den Debitor an.')],
                },
                {
                    kind: 'Field', name: 'Order Date', properties: [caption('Order Date', 'Auftragsdatum')],
                    methods: [{ kind: 'trigger', name: 'OnValidate', labels: [label('FutureDateErr', 'The order date %1 lies in the future.', 'Das Auftragsdatum %1 liegt in der Zukunft.')] }],
                },
                { kind: 'Field', name: 'Größe', properties: [caption('Size', 'Größe')] },
            ],
        },
        {
            kind: 'Table', id: 70002, name: 'Northwind Order', namespace: 'Northwind.Purchasing',
            properties: [caption('Northwind Purchase Order', 'Northwind-Bestellung')],
            members: [
                { kind: 'Field', name: 'No.', properties: [caption('No.', 'Nr.')] },
                { kind: 'Field', name: 'Vendor No.', properties: [caption('Vendor No.', 'Kreditorennr.')] },
            ],
        },
        {
            kind: 'Page', id: 70010, name: 'Northwind Order Card', namespace: 'Northwind.Sales',
            properties: [caption('Northwind Order Card', 'Northwind-Auftragskarte')],
            members: [
                { kind: 'Control', name: 'No.', properties: [toolTip('Specifies the number of the order.', 'Gibt die Nummer des Auftrags an.')] },
                { kind: 'Control', name: 'Customer No.', properties: [toolTip('Specifies the customer of the order.', 'Gibt den Debitor des Auftrags an.')] },
                {
                    kind: 'Action', name: 'Release',
                    properties: [caption('Release', 'Freigeben'), toolTip('Releases the order.', 'Gibt den Auftrag frei.')],
                    methods: [{ kind: 'trigger', name: 'OnAction', labels: [label('ReleasedMsg', 'Order %1 was released.', 'Auftrag %1 wurde freigegeben.')] }],
                },
            ],
        },
        {
            kind: 'Report', id: 70020, name: 'Northwind Sales - Quote', namespace: 'Northwind.Sales',
            properties: [caption('Northwind Sales - Quote', 'Northwind Verkauf - Angebot')],
            members: [],
            labels: [label('NoLinesErr', 'The quote has no lines.', 'Das Angebot hat keine Zeilen.')],
            reportLabels: [label('PageLbl', 'Page', 'Seite'), label('TotalLbl', 'Total', 'Gesamt')],
        },
        {
            kind: 'Codeunit', id: 70030, name: 'Northwind Legacy Mgt.',
            properties: [],
            members: [],
            methods: [{
                kind: 'procedure', name: 'Run',
                labels: [label('StartedMsg', 'The run has started.', 'Der Lauf wurde gestartet.'), label('DoneMsg', 'The run is done.', 'Der Lauf ist abgeschlossen.')],
            }],
        },
        {
            kind: 'Enum', id: 70040, name: 'Northwind Order Status', namespace: 'Northwind.Sales',
            properties: [],
            members: [
                { kind: 'EnumValue', name: 'Open', properties: [caption('Open', 'Offen')] },
                { kind: 'EnumValue', name: 'Released', properties: [caption('Released', 'Freigegeben')] },
            ],
        },
        {
            kind: 'PageExtension', id: 70050, name: 'Northwind Customer Card Ext.', namespace: 'Northwind.Sales',
            extends: { kind: 'Page', name: 'Customer Card' },
            properties: [],
            members: [
                {
                    kind: 'Control', name: 'Northwind Orders',
                    properties: [caption('Northwind Orders', 'Northwind-Aufträge'), toolTip('Specifies the open Northwind orders.', 'Gibt die offenen Northwind-Aufträge an.')],
                },
                {
                    kind: 'Action', name: 'Northwind Show Orders', properties: [caption('Show Orders', 'Aufträge anzeigen')],
                    methods: [{ kind: 'trigger', name: 'OnAction', labels: [label('NoOrdersMsg', 'There are no orders.', 'Es gibt keine Aufträge.')] }],
                },
            ],
        },
        {
            kind: 'PageExtension', id: 70051, name: 'Northwind Customer List Ext.', namespace: 'Northwind.Sales',
            extends: { kind: 'Page', name: 'Customer List' },
            properties: [],
            members: [{ kind: 'Control', name: 'Northwind Order Count', properties: [caption('Order Count', 'Anzahl Aufträge')] }],
        },
        {
            kind: 'PageExtension', id: 70052, name: 'Northwind Customer List Extra', namespace: 'Northwind.Sales',
            extends: { kind: 'Page', name: 'Customer List' },
            properties: [],
            members: [
                { kind: 'Control', name: 'Northwind Last Order', properties: [caption('Last Order', 'Letzter Auftrag')] },
                {
                    kind: 'Action', name: 'Northwind New Order', properties: [caption('New Order', 'Neuer Auftrag')],
                    methods: [{ kind: 'trigger', name: 'OnAction', labels: [label('CreatedMsg', 'Order %1 was created.', 'Auftrag %1 wurde erstellt.')] }],
                },
            ],
        },
        {
            kind: 'TableExtension', id: 70060, name: 'Northwind Setup Ext.', namespace: 'Northwind.Common',
            extends: { kind: 'Table', name: 'Northwind Setup' },
            properties: [],
            members: [{ kind: 'Field', name: 'Region Code', properties: [caption('Region Code', 'Regionscode')] }],
        },
        {
            kind: 'Page', id: 70070, name: 'Northwind Order API', namespace: 'Northwind.Sales',
            properties: [],
            members: [],
            methods: [{
                kind: 'procedure', name: 'ReleaseOrder', labels: [],
                apiCaption: { methodId: 7007001, source: 'Release Order', german: 'Auftrag freigeben' },
            }],
        },
        {
            kind: 'Codeunit', id: 70080, name: 'Northwind Print Template Mgt.', namespace: LONG_NAMESPACE,
            properties: [],
            members: [],
            methods: [
                { kind: 'procedure', name: 'Run', labels: [label('PrintedMsg', '%1 documents were printed.', '%1 Belege wurden gedruckt.')] },
                {
                    kind: 'procedure', name: LONG_PROCEDURE,
                    labels: [label(LONG_LABEL, 'No print template is set up for location %1.', 'Für Lagerort %1 ist keine Druckvorlage eingerichtet.')],
                },
            ],
        },
    ],
};

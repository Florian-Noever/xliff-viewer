namespace Northwind.Logistics.Warehousing.Outbound.Shipping.Documents.Printing.Templates.Configuration.Validation.Rules;

using Shared.Utilities;

codeunit 70080 "Northwind Print Template Mgt."
{

    procedure Run()
    var
        PrintedMsg: Label '%1 documents were printed.';
    begin
    end;

    procedure ValidateOutboundShipmentDocumentPrintTemplateConfigurationBeforeReleasingTheWarehouseShipmentToTheCarrierForDispatch()
    var
        OutboundShipmentDocumentPrintTemplateConfigurationIsMissingForTheSelectedLocationAndShippingAgentServiceCombinationErr: Label 'No print template is set up for location %1.';
    begin
    end;
}

/**
 * Hand-written AL source, invented, one snippet per construct the outline reads.
 *
 * Written the way AL is written in the field — mixed keyword case, comments and strings
 * holding braces, attributes, `#if` — rather than the way a generator would write it, so the
 * outline is tested against more than its own assumptions.
 */

export const TABLE = `namespace Contoso.Sales;

using Microsoft.Sales.Customer;

table 50100 "Contoso Order"
{
    Caption = 'Contoso Order';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "No."; Code[20])
        {
            Caption = 'No.';
            tooltip = 'Specifies the number. {Not a brace}';
        }
        field(2; "Order Date"; Date)
        {
            Caption = 'Order Date';
            TableRelation = Customer where("No." = field("No."));

            trigger OnValidate()
            var
                FutureDateErr: Label 'The date %1 lies in the future.', Comment = '%1 = the date';
            begin
                if "Order Date" > Today() then
                    Error(FutureDateErr, "Order Date");
            end;
        }
        field(3; Größe; Decimal) { }
        // field(4; Commented; Code[10]) { Caption = 'Not here'; }
        /* field(5; "Block Commented"; Code[10])
        {
        } */
    }
    keys
    {
        key(PK; "No.") { Clustered = true; }
    }
    fieldgroups
    {
        fieldgroup(DropDown; "No.", "Order Date") { Caption = 'Order'; }
    }

    var
        GlobalLbl: Label 'Global';
}
`;

export const PAGE = `page 50101 "Contoso Order Card"
{
    PageType = Card;
    SourceTable = "Contoso Order";
    Caption = 'Contoso Order Card';

    layout
    {
        area(Content)
        {
            group(General)
            {
                Caption = 'General';
                field("No."; Rec."No.") { ToolTip = 'Specifies the number.'; }
                part(Lines; "Contoso Order Subform") { }
            }
        }
    }
    actions
    {
        area(Processing)
        {
            group(Release)
            {
                action(ReleaseOrder)
                {
                    Caption = 'Release';

                    trigger OnAction()
                    var
                        ReleasedMsg: Label 'Order released.';
                    begin
                        Message(ReleasedMsg);
                    end;
                }
            }
        }
        area(Promoted)
        {
            actionref(ReleaseOrder_Promoted; ReleaseOrder) { }
        }
    }
    views
    {
        view(OpenOrders) { Caption = 'Open Orders'; }
    }
}
`;

export const PAGE_EXTENSION = `pageextension 50102 "Contoso Customer Card Ext." extends Microsoft.Sales.Customer."Customer Card"
{
    layout
    {
        addafter(Name)
        {
            field("Contoso Orders"; Rec."Contoso Orders") { Caption = 'Orders'; }
        }
        modify("Phone No.") { Caption = 'Phone'; }
        moveafter(Name; "Phone No.")
    }
}
`;

export const REPORT = `report 50103 "Contoso Sales - Quote"
{
    Caption = 'Contoso Sales - Quote';

    dataset
    {
        dataitem(Header; "Contoso Order")
        {
            column(No_; "No.") { IncludeCaption = true; }
            column(Amount; Amount) { Caption = 'Amount'; }

            trigger OnAfterGetRecord()
            var
                NoLinesErr: Label 'The quote has no lines.';
            begin
            end;
        }
    }
    requestpage
    {
        SaveValues = true;
        layout
        {
            area(Content)
            {
                field(ShowDetails; ShowDetails) { Caption = 'Show Details'; }
            }
        }

        trigger OnOpenPage()
        var
            OpenedMsg: Label 'Opened.';
        begin
        end;
    }
    labels
    {
        PageLbl = 'Page', Comment = 'Printed at the top';
        TotalLbl = 'Total';
    }
    rendering
    {
        layout(QuoteLayout)
        {
            Type = RDLC;
            LayoutFile = 'Quote.rdl';
            Caption = 'Quote';
        }
    }

    var
        ShowDetails: Boolean;
}
`;

export const CODEUNIT = `codeunit 50104 "Contoso Mgt."
{
    trigger OnRun()
    begin
        Run();
    end;

    [EventSubscriber(ObjectType::Table, Database::Customer, 'OnAfterInsertEvent', '', false, false)]
    local procedure OnAfterInsertCustomer(var Rec: Record Customer)
    var
        InsertedMsg: Label 'Customer %1 inserted.', Comment = '%1 = the number';
    begin
        case Rec."No." of
            '':
                exit;
            else begin
                Message(InsertedMsg, Rec."No.");
            end;
        end;
    end;

    internal procedure Run() Result: Boolean
    var
        Text001: TextConst ENU = 'Old style', DEU = 'Alter Stil';
    begin
        exit(true);
    end;

    PROCEDURE Shout();
    BEGIN
    END;

    protected var
        StartedMsg: Label 'Started {with braces} and ''quotes''';
        Counter, Total: Integer;
}
`;

export const ENUM = `enum 50105 "Contoso Status" implements "Contoso IStatus"
{
    Extensible = true;

    value(0; " ") { Caption = ' '; }
    value(1; Open)
    {
        Caption = 'Open';
        Implementation = "Contoso IStatus" = "Contoso Open Status";
    }
}
`;

export const INTERFACE = `interface "Contoso IStatus"
{
    procedure Describe(): Text;
    procedure IsFinal(): Boolean;
}
`;

export const XMLPORT = `xmlport 50106 "Contoso Export"
{
    Caption = 'Contoso Export';

    schema
    {
        textelement(Root)
        {
            tableelement(Order; "Contoso Order")
            {
                fieldelement(No; Order."No.") { }
                textattribute(Version) { }
            }
        }
    }
}
`;

export const QUERY = `query 50107 "Contoso Orders"
{
    Caption = 'Contoso Orders';

    elements
    {
        dataitem(Header; "Contoso Order")
        {
            column(No; "No.") { Caption = 'No.'; }
            filter(OrderDate; "Order Date") { }
        }
    }
}
`;

export const PROFILE_AND_PERMISSIONS = `profile "Contoso Clerk"
{
    Caption = 'Contoso Clerk';
    ProfileDescription = 'Enters orders.';
    RoleCenter = "Contoso Role Center";
}

permissionset 50108 "Contoso Edit"
{
    Assignable = true;
    Caption = 'Contoso - Edit';
    Permissions = tabledata "Contoso Order" = RIMD;
}
`;

export const CUSTOMIZATION = `pagecustomization "Contoso Lean Card" customizes "Customer Card"
{
    layout
    {
        modify(Name) { Visible = false; }
    }
}
`;

export const DOTNET_AND_ADDIN = `dotnet
{
    assembly("Contoso.Interop")
    {
        type("Contoso.Interop.Scale"; Scale) { }
    }
}

controladdin "Contoso Map"
{
    Scripts = 'map.js';
    event MapReady();
    procedure Show(Latitude: Decimal);
}
`;

export const API_PAGE = `page 50109 "Contoso Order API"
{
    PageType = API;
    EntityCaption = 'Order';
    EntitySetCaption = 'Orders';

    [ServiceEnabled]
    [Caption('Release Order', Locked = false)]
    procedure ReleaseOrder(var ActionContext: WebServiceActionContext)
    begin
    end;
}
`;

/** One object whose compiled shape depends on `CLEAN`: both branches open a block. */
export const DIRECTIVES = `table 50110 "Contoso Legacy"
{
    fields
    {
#if CLEAN
        field(1; Code; Code[20])
        {
#else
        field(1; Code; Code[10])
        {
            ObsoleteState = Pending;
#endif
            Caption = 'Code';
        }
#region Kept
        field(2; Kept; Integer) { }
#endregion
    }
}
`;

/** Two objects in one file, mixed-case keywords, no namespace. */
export const TWO_OBJECTS = `TABLE 50111 Plain { fields { FIELD(1; Code; Code[20]) { CAPTION = 'Code'; } } }
codeunit 50112 Helper { procedure Help() begin end; }
`;

/**
 * What a structural reading most easily gets wrong: brackets in a return type, attributes on
 * variables, a verbatim string over several lines, an add with no anchor, and a report label
 * in its multilanguage form.
 */
export const EDGES = `codeunit 50113 "Contoso Edges"
{
    var
        [InDataSet]
        IsVisible: Boolean;
        AfterLbl: Label 'After';

    procedure GetCode(): Code[20]
    var
        LocalLbl: Label 'Local';
    begin
        if Rec.Caption = '' then
            exit('');
    end;

    procedure GetList() Result: List of [Text]
    var
        [SecurityFiltering(SecurityFilter::Filtered)]
        Customer: Record Customer;
        ListLbl: Label 'List';
    begin
        Message(@'Line one {
#if CLEAN
line two }');
    end;

    procedure After()
    var
        AfterMethodLbl: Label 'After method';
    begin
    end;
}

pageextension 50114 "Contoso Views Ext." extends "Customer List"
{
    views
    {
        addfirst
        {
            view(OpenOnes)
            {
                Caption = 'Open';
            }
        }
    }
}

report 50115 "Contoso Labels"
{
    labels
    {
        label(CompanyCaption; ENU = 'Company', DEU = 'Firma')
        TotalLbl = 'Total', Comment = 'A total';
    }
}
`;

export const SNIPPETS: Readonly<Record<string, string>> = {
    TABLE, PAGE, PAGE_EXTENSION, REPORT, CODEUNIT, ENUM, INTERFACE, XMLPORT, QUERY, PROFILE_AND_PERMISSIONS,
    CUSTOMIZATION, DOTNET_AND_ADDIN, API_PAGE, DIRECTIVES, TWO_OBJECTS, EDGES,
};

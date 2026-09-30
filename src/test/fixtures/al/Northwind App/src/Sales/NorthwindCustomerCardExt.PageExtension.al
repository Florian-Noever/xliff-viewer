namespace Northwind.Sales;

using Shared.Utilities;

pageextension 70050 "Northwind Customer Card Ext." extends "Customer Card"
{
    layout
    {
        addlast(Content)
        {
            group(General)
            {
                field("Northwind Orders"; Rec."Northwind Orders")
                {
                    Caption = 'Northwind Orders';
                    ToolTip = 'Specifies the open Northwind orders.';
                }
            }
        }
    }
    actions
    {
        addlast(Processing)
        {
            action("Northwind Show Orders")
            {
                Caption = 'Show Orders';
                trigger onaction()
                var
                    NoOrdersMsg: Label 'There are no orders.';
                begin
                end;
            }
        }
    }
}

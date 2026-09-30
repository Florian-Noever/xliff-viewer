NAMESPACE Northwind.Sales;

USING Shared.Utilities;

PAGEEXTENSION 70051 "Northwind Customer List Ext." EXTENDS "Customer List"
{
    LAYOUT
    {
        ADDLAST(Content)
        {
            GROUP(General)
            {
                FIELD("Northwind Order Count"; Rec."Northwind Order Count")
                {
                    Caption = 'Order Count';
                }
            }
        }
    }
}

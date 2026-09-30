namespace Northwind.Sales;

using Shared.Utilities;

pageextension 70052 "Northwind Customer List Extra" extends "Customer List"
{
    layout
    {
        addlast(Content)
        {
            group(General)
            {
                field("Northwind Last Order"; Rec."Northwind Last Order")
                {
                    caption = 'Last Order';
                }
            }
        }
    }
    actions
    {
        addlast(Processing)
        {
            action("Northwind New Order")
            {
                caption = 'New Order';
                trigger OnAction()
                var
                    CreatedMsg: Label 'Order %1 was created.';
                begin
                end;
            }
        }
    }
}

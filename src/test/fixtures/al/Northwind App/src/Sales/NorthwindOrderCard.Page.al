namespace Northwind.Sales;

using Shared.Utilities;

page 70010 "Northwind Order Card"
{
#if CLEAN
    Caption = 'Northwind Order Card';
#else
    Caption = 'Northwind Order Card (obsolete)';
    ObsoleteState = Pending;
#endif
    layout
    {
        area(Content)
        {
            group(General)
            {
                field("No."; Rec."No.")
                {
                    ToolTip = 'Specifies the number of the order.';
                }
                field("Customer No."; Rec."Customer No.")
                {
                    ToolTip = 'Specifies the customer of the order.';
                }
            }
        }
    }
    actions
    {
        area(Processing)
        {
            action(Release)
            {
                Caption = 'Release';
                ToolTip = 'Releases the order.';
                trigger OnAction()
                var
                    ReleasedMsg: Label 'Order %1 was released.';
                begin
                end;
            }
        }
    }
}

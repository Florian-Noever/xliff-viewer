namespace Northwind.Common;

using Shared.Utilities;

table 70000 "Northwind Setup"
{
    // Kept apart from the { braces } below; none of this is structure.
    Caption = 'Northwind Setup';
    fields
    {
        field(1; "Primary Key"; Code[20])
        {
            Caption = 'Primary Key';
        }
        field(2; "Order Nos."; Code[20])
        {
            Caption = 'Order Nos.';
            ToolTip = 'Specifies the number series for orders.';
        }
    }
}

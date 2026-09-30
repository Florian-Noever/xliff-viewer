NAMESPACE Northwind.Purchasing;

USING Shared.Utilities;

TABLE 70002 "Northwind Order"
{
    Caption = 'Northwind Purchase Order';
    FIELDS
    {
        FIELD(1; "No."; Code[20])
        {
            Caption = 'No.';
        }
        FIELD(2; "Vendor No."; Code[20])
        {
        }
    }
}

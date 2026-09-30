namespace Northwind.Sales;

using Shared.Utilities;

table 70001 "Northwind Order"
{
    caption = 'Northwind Order';
    fields
    {
        field(1; "No."; Code[20])
        {
            caption = 'No.';
        }
        field(2; "Customer No."; Code[20])
        {
            caption = 'Customer No.';
            tooltip = 'Specifies the customer.';
        }
        field(3; "Order Date"; Code[20])
        {
            caption = 'Order Date';
            trigger onvalidate()
            var
                FutureDateErr: Label 'The order date %1 lies in the future.';
            begin
            end;
        }
        field(4; "Größe"; Code[20])
        {
            caption = 'Size';
        }
    }
}

namespace Northwind.Sales;

using Shared.Utilities;

enum 70040 "Northwind Order Status"
{
    value(0; Open)
    {
        Caption = 'Open';
    }
    value(1; Released)
    {
        Caption = 'Released';
    }
}

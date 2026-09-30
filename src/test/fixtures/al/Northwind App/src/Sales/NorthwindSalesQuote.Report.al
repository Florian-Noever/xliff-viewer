namespace Northwind.Sales;

using Shared.Utilities;

report 70020 "Northwind Sales - Quote"
{
    Caption = 'Northwind Sales - Quote';
    labels
    {
        PageLbl = 'Page';
        TotalLbl = 'Total';
    }

    var
        NoLinesErr: Label 'The quote has no lines.';
}

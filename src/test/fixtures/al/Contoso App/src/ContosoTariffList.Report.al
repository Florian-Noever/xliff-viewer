report 50040 "Contoso Tariff - List"
{
#if CLEAN
    Caption = 'Contoso Tariff - List';
#else
    Caption = 'Contoso Tariff - List (obsolete)';
    ObsoleteState = Pending;
#endif
    labels
    {
        PageLbl = 'Page';
        TotalLbl = 'Total';
        DateLbl = 'Date';
        NoLbl = 'No.';
        DescriptionLbl = 'Description';
        AmountLbl = 'Amount';
        QuantityLbl = 'Quantity';
        SignatureLbl = 'Signature';
        ContinuedLbl = 'Continued';
    }
}

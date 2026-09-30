table 50003 "Contoso Branch"
{
#if CLEAN
    Caption = 'Contoso Branch';
#else
    Caption = 'Contoso Branch (obsolete)';
    ObsoleteState = Pending;
#endif
    fields
    {
        field(1; "Unit Price"; Code[20])
        {
            Caption = 'Unit Price';
        }
        field(2; "Location Code"; Code[20])
        {
        }
        field(3; "Bin Code"; Code[20])
        {
            Caption = 'Bin Code';
        }
        field(4; "Item No."; Code[20])
        {
            Caption = 'Item No.';
        }
        field(5; "Customer No."; Code[20])
        {
            Caption = 'Customer No.';
        }
        field(6; "Vendor No."; Code[20])
        {
            Caption = 'Vendor No.';
        }
        field(7; "E-Mail"; Code[20])
        {
        }
        field(8; "Phone No."; Code[20])
        {
            Caption = 'Phone No.';
        }
        field(9; Address; Code[20])
        {
            Caption = 'Address';
        }
    }
}

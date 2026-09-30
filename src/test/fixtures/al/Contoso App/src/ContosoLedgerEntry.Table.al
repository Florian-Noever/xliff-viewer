TABLE 50008 "Contoso Ledger Entry"
{
    Caption = 'Contoso Ledger Entry';
    FIELDS
    {
        FIELD(1; Volume; Code[20])
        {
            Caption = 'Volume';
        }
        FIELD(2; "Language Code"; Code[20])
        {
        }
        FIELD(3; "Payment Terms Code"; Code[20])
        {
            Caption = 'Payment Terms Code';
        }
        FIELD(4; "Shipment Date"; Code[20])
        {
            Caption = 'Shipment Date';
        }
        FIELD(5; "External Document No."; Code[20])
        {
            Caption = 'External Document No.';
        }
        FIELD(6; Comment; Code[20])
        {
            Caption = 'Comment';
        }
        FIELD(7; Enabled; Code[20])
        {
        }
        FIELD(8; Default; Code[20])
        {
            Caption = 'Default';
        }
        FIELD(9; "Template Name"; Code[20])
        {
            Caption = 'Template Name';
        }
    }
}

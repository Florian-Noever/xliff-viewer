table 50000 "Contoso Setup"
{
    // Kept apart from the { braces } below; none of this is structure.
    Caption = 'Contoso Setup';
    fields
    {
        field(1; "No."; Code[20])
        {
            Caption = 'No.';
        }
        field(2; Name; Code[20])
        {
            Caption = 'Name';
        }
        field(3; Description; Code[20])
        {
            Caption = 'Description';
        }
        field(4; Code; Code[20])
        {
        }
        field(5; Status; Code[20])
        {
            Caption = 'Status';
        }
        field(6; "Posting Date"; Code[20])
        {
            Caption = 'Posting Date';
        }
        field(7; "Document No."; Code[20])
        {
            Caption = 'Document No.';
        }
        field(8; Amount; Code[20])
        {
            Caption = 'Amount';
        }
        field(9; Quantity; Code[20])
        {
        }
    }
}

PAGE 50011 "Contoso Methods Setup"
{
    Caption = 'Contoso Methods Setup';
    LAYOUT
    {
        AREA(Content)
        {
            GROUP(General)
            {
                FIELD(Status; Rec.Status)
                {
                    Caption = 'Status';
                    ToolTip = 'Specifies the value of the Status field.';
                }
                FIELD(PostingDate; Rec.PostingDate)
                {
                    Caption = 'Posting Date';
                    ToolTip = 'Specifies the value of the Posting Date field.';
                }
                FIELD(DocumentNo; Rec.DocumentNo)
                {
                    Caption = 'Document No.';
                    ToolTip = 'Specifies the value of the Document No. field.';
                }
                FIELD(Amount; Rec.Amount)
                {
                    Caption = 'Amount';
                    ToolTip = 'Specifies the value of the Amount field.';
                }
                FIELD(Quantity; Rec.Quantity)
                {
                    Caption = 'Quantity';
                    ToolTip = 'Specifies the value of the Quantity field.';
                }
                FIELD(UnitPrice; Rec.UnitPrice)
                {
                    Caption = 'Unit Price';
                    ToolTip = 'Specifies the value of the Unit Price field.';
                }
                FIELD(LocationCode; Rec.LocationCode)
                {
                    Caption = 'Location Code';
                    ToolTip = 'Specifies the value of the Location Code field.';
                }
                FIELD(BinCode; Rec.BinCode)
                {
                    Caption = 'Bin Code';
                    ToolTip = 'Specifies the value of the Bin Code field.';
                }
            }
        }
    }
    ACTIONS
    {
        AREA(Processing)
        {
            ACTION(SendtoRelay)
            {
                Caption = 'Send to Relay';
                ToolTip = 'Sends the record to the relay service.';
                TRIGGER OnAction()
                VAR
                    NothingToPostMsg: Label 'Nothing to post.';
                BEGIN
                END;
            }
        }
    }
}

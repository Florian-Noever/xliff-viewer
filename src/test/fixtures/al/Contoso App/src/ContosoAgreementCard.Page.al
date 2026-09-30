page 50016 "Contoso Agreement Card"
{
    Caption = 'Contoso Agreement Card';
    layout
    {
        area(Content)
        {
            group(General)
            {
                field(Volume; Rec.Volume)
                {
                    Caption = 'Volume';
                    ToolTip = 'Specifies the value of the Volume field.';
                }
                field(LanguageCode; Rec.LanguageCode)
                {
                    Caption = 'Language Code';
                    ToolTip = 'Specifies the value of the Language Code field.';
                }
                field(PaymentTermsCode; Rec.PaymentTermsCode)
                {
                    Caption = 'Payment Terms Code';
                    ToolTip = 'Specifies the value of the Payment Terms Code field.';
                }
                field(ShipmentDate; Rec.ShipmentDate)
                {
                    Caption = 'Shipment Date';
                    ToolTip = 'Specifies the value of the Shipment Date field.';
                }
                field(ExternalDocumentNo; Rec.ExternalDocumentNo)
                {
                    Caption = 'External Document No.';
                    ToolTip = 'Specifies the value of the External Document No. field.';
                }
                field(Comment; Rec.Comment)
                {
                    Caption = 'Comment';
                    ToolTip = 'Specifies the value of the Comment field.';
                }
                field(Enabled; Rec.Enabled)
                {
                    Caption = 'Enabled';
                    ToolTip = 'Specifies the value of the Enabled field.';
                }
                field(Default; Rec.Default)
                {
                    Caption = 'Default';
                    ToolTip = 'Specifies the value of the Default field.';
                }
            }
        }
    }
    actions
    {
        area(Processing)
        {
            action(Post)
            {
                Caption = 'Post';
                ToolTip = 'Posts the selected documents.';
                trigger onaction()
                var
                    PrintedMsg: Label '%1 labels were printed.';
                begin
                end;
            }
        }
    }
}

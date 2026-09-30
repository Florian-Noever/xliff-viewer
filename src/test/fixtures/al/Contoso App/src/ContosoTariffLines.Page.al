page 50015 "Contoso Tariff Lines"
{
    // Kept apart from the { braces } below; none of this is structure.
    Caption = 'Contoso Tariff Lines';
    layout
    {
        area(Content)
        {
            group(General)
            {
                field(CurrencyCode; Rec.CurrencyCode)
                {
                    Caption = 'Currency Code';
                    ToolTip = 'Specifies the value of the Currency Code field.';
                }
                field(Blocked; Rec.Blocked)
                {
                    Caption = 'Blocked';
                    ToolTip = 'Specifies the value of the Blocked field.';
                }
                field(LastDateModified; Rec.LastDateModified)
                {
                    Caption = 'Last Date Modified';
                    ToolTip = 'Specifies the value of the Last Date Modified field.';
                }
                field(Weight; Rec.Weight)
                {
                    Caption = 'Weight';
                    ToolTip = 'Specifies the value of the Weight field.';
                }
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
            }
        }
    }
    actions
    {
        area(Processing)
        {
            action(Weigh)
            {
                Caption = 'Weigh';
                ToolTip = 'Reads the weight from the scale.';
                trigger OnAction()
                var
                    NothingToPostMsg: Label 'Nothing to post.';
                begin
                end;
            }
        }
    }
}

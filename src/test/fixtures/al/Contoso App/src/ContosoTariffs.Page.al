PAGE 50014 "Contoso Tariffs"
{
    Caption = 'Contoso Tariffs';
    LAYOUT
    {
        AREA(Content)
        {
            GROUP(General)
            {
                FIELD(PhoneNo; Rec.PhoneNo)
                {
                    Caption = 'Phone No.';
                    ToolTip = 'Specifies the value of the Phone No. field.';
                }
                FIELD(Address; Rec.Address)
                {
                    Caption = 'Address';
                    ToolTip = 'Specifies the value of the Address field.';
                }
                FIELD(City; Rec.City)
                {
                    Caption = 'City';
                    ToolTip = 'Specifies the value of the City field.';
                }
                FIELD(CountryRegionCode; Rec.CountryRegionCode)
                {
                    Caption = 'Country/Region Code';
                    ToolTip = 'Specifies the value of the Country/Region Code field.';
                }
                FIELD(CurrencyCode; Rec.CurrencyCode)
                {
                    Caption = 'Currency Code';
                    ToolTip = 'Specifies the value of the Currency Code field.';
                }
                FIELD(Blocked; Rec.Blocked)
                {
                    Caption = 'Blocked';
                    ToolTip = 'Specifies the value of the Blocked field.';
                }
                FIELD(LastDateModified; Rec.LastDateModified)
                {
                    Caption = 'Last Date Modified';
                    ToolTip = 'Specifies the value of the Last Date Modified field.';
                }
                FIELD(Weight; Rec.Weight)
                {
                    Caption = 'Weight';
                    ToolTip = 'Specifies the value of the Weight field.';
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
                    PostQst: Label 'Do you want to post %1 %2?';
                BEGIN
                END;
            }
        }
    }
}

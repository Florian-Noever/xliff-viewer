page 50013 "Contoso Branch Card"
{
    caption = 'Contoso Branch Card';
    layout
    {
        area(Content)
        {
            group(General)
            {
                field(ItemNo; Rec.ItemNo)
                {
                    caption = 'Item No.';
                    tooltip = 'Specifies the value of the Item No. field.';
                }
                field(CustomerNo; Rec.CustomerNo)
                {
                    caption = 'Customer No.';
                    tooltip = 'Specifies the value of the Customer No. field.';
                }
                field(VendorNo; Rec.VendorNo)
                {
                    caption = 'Vendor No.';
                    tooltip = 'Specifies the value of the Vendor No. field.';
                }
                field(EMail; Rec.EMail)
                {
                    caption = 'E-Mail';
                    tooltip = 'Specifies the value of the E-Mail field.';
                }
                field(PhoneNo; Rec.PhoneNo)
                {
                    caption = 'Phone No.';
                    tooltip = 'Specifies the value of the Phone No. field.';
                }
                field(Address; Rec.Address)
                {
                    caption = 'Address';
                    tooltip = 'Specifies the value of the Address field.';
                }
                field(City; Rec.City)
                {
                    caption = 'City';
                    tooltip = 'Specifies the value of the City field.';
                }
                field(CountryRegionCode; Rec.CountryRegionCode)
                {
                    caption = 'Country/Region Code';
                    tooltip = 'Specifies the value of the Country/Region Code field.';
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
                caption = 'Post';
                tooltip = 'Posts the selected documents.';
                trigger onaction()
                var
                    WeightErr: Label 'Weight %1 exceeds the limit of %2.';
                begin
                end;
            }
        }
    }
}

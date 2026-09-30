page 50012 "Contoso Region List"
{
    Caption = 'Contoso Region List';
    layout
    {
        area(Content)
        {
            group(General)
            {
                field(Quantity; Rec.Quantity)
                {
                    Caption = 'Quantity';
                    ToolTip = 'Specifies the value of the Quantity field.';
                }
                field(UnitPrice; Rec.UnitPrice)
                {
                    Caption = 'Unit Price';
                    ToolTip = 'Specifies the value of the Unit Price field.';
                }
                field(LocationCode; Rec.LocationCode)
                {
                    Caption = 'Location Code';
                    ToolTip = 'Specifies the value of the Location Code field.';
                }
                field(BinCode; Rec.BinCode)
                {
                    Caption = 'Bin Code';
                    ToolTip = 'Specifies the value of the Bin Code field.';
                }
                field(ItemNo; Rec.ItemNo)
                {
                    Caption = 'Item No.';
                    ToolTip = 'Specifies the value of the Item No. field.';
                }
                field(CustomerNo; Rec.CustomerNo)
                {
                    Caption = 'Customer No.';
                    ToolTip = 'Specifies the value of the Customer No. field.';
                }
                field(VendorNo; Rec.VendorNo)
                {
                    Caption = 'Vendor No.';
                    ToolTip = 'Specifies the value of the Vendor No. field.';
                }
                field(EMail; Rec.EMail)
                {
                    Caption = 'E-Mail';
                    ToolTip = 'Specifies the value of the E-Mail field.';
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
                    PrintedMsg: Label '%1 labels were printed.';
                begin
                end;
            }
        }
    }
}

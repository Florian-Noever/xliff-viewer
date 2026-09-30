page 50019 "Contoso Archive List"
{
    Caption = 'Contoso Archive List';
    layout
    {
        area(Content)
        {
            group(General)
            {
                field(SalespersonCode; Rec.SalespersonCode)
                {
                    Caption = 'Salesperson Code';
                    ToolTip = 'Specifies the value of the Salesperson Code field.';
                }
                field(RouteCode; Rec.RouteCode)
                {
                    Caption = 'Route Code';
                    ToolTip = 'Specifies the value of the Route Code field.';
                }
                field(CarrierCode; Rec.CarrierCode)
                {
                    Caption = 'Carrier Code';
                    ToolTip = 'Specifies the value of the Carrier Code field.';
                }
                field(DockDoor; Rec.DockDoor)
                {
                    Caption = 'Dock Door';
                    ToolTip = 'Specifies the value of the Dock Door field.';
                }
                field(No; Rec.No)
                {
                    Caption = 'No.';
                    ToolTip = 'Specifies the value of the No. field.';
                }
                field(Name; Rec.Name)
                {
                    Caption = 'Name';
                    ToolTip = 'Specifies the value of the Name field.';
                }
                field(Description; Rec.Description)
                {
                    Caption = 'Description';
                    ToolTip = 'Specifies the value of the Description field.';
                }
                field(Code; Rec.Code)
                {
                    Caption = 'Code';
                    ToolTip = 'Specifies the value of the Code field.';
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
                    NothingToPostMsg: Label 'Nothing to post.';
                begin
                end;
            }
        }
    }
}

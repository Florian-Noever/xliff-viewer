page 50018 "Contoso Ledger Entries"
{
    Caption = 'Contoso Ledger Entries';
    layout
    {
        area(Content)
        {
            group(General)
            {
                field(TemplateName; Rec.TemplateName)
                {
                    Caption = 'Template Name';
                    ToolTip = 'Specifies the value of the Template Name field.';
                }
                field(BatchName; Rec.BatchName)
                {
                    Caption = 'Batch Name';
                    ToolTip = 'Specifies the value of the Batch Name field.';
                }
                field(LineNo; Rec.LineNo)
                {
                    Caption = 'Line No.';
                    ToolTip = 'Specifies the value of the Line No. field.';
                }
                field(EntryNo; Rec.EntryNo)
                {
                    Caption = 'Entry No.';
                    ToolTip = 'Specifies the value of the Entry No. field.';
                }
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
                    PostQst: Label 'Do you want to post %1 %2?';
                begin
                end;
            }
        }
    }
}

page 50010 "Contoso Setup"
{
    // Kept apart from the { braces } below; none of this is structure.
#if CLEAN
    Caption = 'Contoso Setup';
#else
    Caption = 'Contoso Setup (obsolete)';
    ObsoleteState = Pending;
#endif
    layout
    {
        area(Content)
        {
            group(General)
            {
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
                field(Status; Rec.Status)
                {
                    Caption = 'Status';
                    ToolTip = 'Specifies the value of the Status field.';
                }
                field(PostingDate; Rec.PostingDate)
                {
                    Caption = 'Posting Date';
                    ToolTip = 'Specifies the value of the Posting Date field.';
                }
                field(DocumentNo; Rec.DocumentNo)
                {
                    Caption = 'Document No.';
                    ToolTip = 'Specifies the value of the Document No. field.';
                }
                field(Amount; Rec.Amount)
                {
                    Caption = 'Amount';
                    ToolTip = 'Specifies the value of the Amount field.';
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
                    PostQst: Label 'Do you want to post %1 %2?';
                begin
                end;
            }
        }
    }
}

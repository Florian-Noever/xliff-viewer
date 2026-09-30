PAGE 50017 "Contoso Agreement Subform"
{
#if CLEAN
    caption = 'Contoso Agreement Subform';
#else
    caption = 'Contoso Agreement Subform (obsolete)';
    ObsoleteState = Pending;
#endif
    LAYOUT
    {
        AREA(Content)
        {
            GROUP(General)
            {
                FIELD(ExternalDocumentNo; Rec.ExternalDocumentNo)
                {
                    caption = 'External Document No.';
                    tooltip = 'Specifies the value of the External Document No. field.';
                }
                FIELD(Comment; Rec.Comment)
                {
                    caption = 'Comment';
                    tooltip = 'Specifies the value of the Comment field.';
                }
                FIELD(Enabled; Rec.Enabled)
                {
                    caption = 'Enabled';
                    tooltip = 'Specifies the value of the Enabled field.';
                }
                FIELD(Default; Rec.Default)
                {
                    caption = 'Default';
                    tooltip = 'Specifies the value of the Default field.';
                }
                FIELD(TemplateName; Rec.TemplateName)
                {
                    caption = 'Template Name';
                    tooltip = 'Specifies the value of the Template Name field.';
                }
                FIELD(BatchName; Rec.BatchName)
                {
                    caption = 'Batch Name';
                    tooltip = 'Specifies the value of the Batch Name field.';
                }
                FIELD(LineNo; Rec.LineNo)
                {
                    caption = 'Line No.';
                    tooltip = 'Specifies the value of the Line No. field.';
                }
                FIELD(EntryNo; Rec.EntryNo)
                {
                    caption = 'Entry No.';
                    tooltip = 'Specifies the value of the Entry No. field.';
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
                caption = 'Send to Relay';
                tooltip = 'Sends the record to the relay service.';
                TRIGGER OnAction()
                VAR
                    WeightErr: Label 'Weight %1 exceeds the limit of %2.';
                BEGIN
                END;
            }
        }
    }
}

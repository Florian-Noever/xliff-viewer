codeunit 50025 "Contoso Install"
{
    // Kept apart from the { braces } below; none of this is structure.

    procedure Calculate()
    var
        AmountErr: Label 'The amount must be > 0.';
        ContinueMsg: Label 'Press <Enter> to continue.';
        TermsLbl: Label 'Terms & Conditions';
        PrintedMsg: Label '%1 labels were printed.';
        RouteBlockedErr: Label 'Route %1 is blocked.';
    begin
    end;

    procedure Initialize()
    var
        UnreachableErr: Label 'Could not reach %1. Error: %2';
        DeleteQst: Label 'Do you want to delete %1?';
        WeightErr: Label 'Weight %1 exceeds the limit of %2.';
        SyncDoneMsg: Label 'Synchronization finished.';
        SelectCarrierMsg: Label 'Select a carrier first.';
    begin
    end;
}

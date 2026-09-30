CODEUNIT 50026 "Contoso Upgrade"
{

    [Scope('OnPrem')]
    PROCEDURE Initialize()
    VAR
        ContinueMsg: Label 'Press <Enter> to continue.';
        TermsLbl: Label 'Terms & Conditions';
        PrintedMsg: Label '%1 labels were printed.';
        RouteBlockedErr: Label 'Route %1 is blocked.';
        UnreachableErr: Label 'Could not reach %1. Error: %2';
    BEGIN
    END;

    [Scope('OnPrem')]
    PROCEDURE Check()
    VAR
        DeleteQst: Label 'Do you want to delete %1?';
        WeightErr: Label 'Weight %1 exceeds the limit of %2.';
        SyncDoneMsg: Label 'Synchronization finished.';
        SelectCarrierMsg: Label 'Select a carrier first.';
        PlannedMsg: Label '%1 of %2 stops were planned.';
    BEGIN
    END;
}

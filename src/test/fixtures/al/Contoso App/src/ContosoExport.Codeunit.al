CODEUNIT 50029 "Contoso Export"
{

    PROCEDURE Post()
    VAR
        RouteBlockedErr: Label 'Route %1 is blocked.';
        UnreachableErr: Label 'Could not reach %1. Error: %2';
        DeleteQst: Label 'Do you want to delete %1?';
        WeightErr: Label 'Weight %1 exceeds the limit of %2.';
        SyncDoneMsg: Label 'Synchronization finished.';
    BEGIN
    END;

    PROCEDURE Validate()
    VAR
        SelectCarrierMsg: Label 'Select a carrier first.';
        PlannedMsg: Label '%1 of %2 stops were planned.';
        PostQst: Label 'Do you want to post %1 %2?';
        ReleasedMsg: Label '%1 %2 has been released.';
        BlankFieldErr: Label 'The %1 field must not be blank.';
    BEGIN
    END;
}

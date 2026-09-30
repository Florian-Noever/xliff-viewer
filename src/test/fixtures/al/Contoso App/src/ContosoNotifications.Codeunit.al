codeunit 50028 "Contoso Notifications"
{

    procedure Run()
    var
        PrintedMsg: Label '%1 labels were printed.';
        RouteBlockedErr: Label 'Route %1 is blocked.';
        UnreachableErr: Label 'Could not reach %1. Error: %2';
        DeleteQst: Label 'Do you want to delete %1?';
        WeightErr: Label 'Weight %1 exceeds the limit of %2.';
    begin
    end;

    procedure Post()
    var
        SyncDoneMsg: Label 'Synchronization finished.';
        SelectCarrierMsg: Label 'Select a carrier first.';
        PlannedMsg: Label '%1 of %2 stops were planned.';
        PostQst: Label 'Do you want to post %1 %2?';
        ReleasedMsg: Label '%1 %2 has been released.';
    begin
    end;
}

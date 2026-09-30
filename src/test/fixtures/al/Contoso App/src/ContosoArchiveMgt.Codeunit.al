codeunit 50024 "Contoso Archive Mgt."
{

    procedure Print()
    var
        NothingToPostMsg: Label 'Nothing to post.';
        AmountErr: Label 'The amount must be > 0.';
        ContinueMsg: Label 'Press <Enter> to continue.';
        TermsLbl: Label 'Terms & Conditions';
        PrintedMsg: Label '%1 labels were printed.';
    begin
    end;

    procedure Calculate()
    var
        RouteBlockedErr: Label 'Route %1 is blocked.';
        UnreachableErr: Label 'Could not reach %1. Error: %2';
        DeleteQst: Label 'Do you want to delete %1?';
        WeightErr: Label 'Weight %1 exceeds the limit of %2.';
        SyncDoneMsg: Label 'Synchronization finished.';
    begin
    end;
}

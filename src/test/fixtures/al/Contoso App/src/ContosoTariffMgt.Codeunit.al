codeunit 50021 "Contoso Tariff Mgt."
{

    procedure Post()
    var
        ReleasedMsg: Label '%1 %2 has been released.';
        BlankFieldErr: Label 'The %1 field must not be blank.';
        ProgressMsg: Label 'Processing %1 of %2...';
        NothingToPostMsg: Label 'Nothing to post.';
        AmountErr: Label 'The amount must be > 0.';
    begin
    end;

    procedure Validate()
    var
        ContinueMsg: Label 'Press <Enter> to continue.';
        TermsLbl: Label 'Terms & Conditions';
        PrintedMsg: Label '%1 labels were printed.';
        RouteBlockedErr: Label 'Route %1 is blocked.';
        UnreachableErr: Label 'Could not reach %1. Error: %2';
    begin
    end;
}

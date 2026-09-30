codeunit 50022 "Contoso Agreement Mgt."
{

    [Scope('OnPrem')]
    procedure Validate()
    var
        BlankFieldErr: Label 'The %1 field must not be blank.';
        ProgressMsg: Label 'Processing %1 of %2...';
        NothingToPostMsg: Label 'Nothing to post.';
        AmountErr: Label 'The amount must be > 0.';
        ContinueMsg: Label 'Press <Enter> to continue.';
    begin
    end;

    [Scope('OnPrem')]
    procedure Send()
    var
        TermsLbl: Label 'Terms & Conditions';
        PrintedMsg: Label '%1 labels were printed.';
        RouteBlockedErr: Label 'Route %1 is blocked.';
        UnreachableErr: Label 'Could not reach %1. Error: %2';
        DeleteQst: Label 'Do you want to delete %1?';
    begin
    end;
}

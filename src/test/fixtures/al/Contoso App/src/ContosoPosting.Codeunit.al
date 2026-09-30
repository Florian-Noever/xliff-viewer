CODEUNIT 50023 "Contoso Posting"
{

    PROCEDURE Send()
    VAR
        ProgressMsg: Label 'Processing %1 of %2...';
        NothingToPostMsg: Label 'Nothing to post.';
        AmountErr: Label 'The amount must be > 0.';
        ContinueMsg: Label 'Press <Enter> to continue.';
        TermsLbl: Label 'Terms & Conditions';
    BEGIN
    END;

    PROCEDURE Print()
    VAR
        PrintedMsg: Label '%1 labels were printed.';
        RouteBlockedErr: Label 'Route %1 is blocked.';
        UnreachableErr: Label 'Could not reach %1. Error: %2';
        DeleteQst: Label 'Do you want to delete %1?';
        WeightErr: Label 'Weight %1 exceeds the limit of %2.';
    BEGIN
    END;
}

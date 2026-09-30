CODEUNIT 50020 "Contoso Mgt."
{
    // Kept apart from the { braces } below; none of this is structure.

    PROCEDURE Run()
    VAR
        PostQst: Label 'Do you want to post %1 %2?';
        ReleasedMsg: Label '%1 %2 has been released.';
        BlankFieldErr: Label 'The %1 field must not be blank.';
        ProgressMsg: Label 'Processing %1 of %2...';
        NothingToPostMsg: Label 'Nothing to post.';
    BEGIN
    END;

    PROCEDURE Post()
    VAR
        AmountErr: Label 'The amount must be > 0.';
        ContinueMsg: Label 'Press <Enter> to continue.';
        TermsLbl: Label 'Terms & Conditions';
        PrintedMsg: Label '%1 labels were printed.';
        RouteBlockedErr: Label 'Route %1 is blocked.';
    BEGIN
    END;
}

TABLE 50005 "Contoso Tariff Line"
{
    // Kept apart from the { braces } below; none of this is structure.
    caption = 'Contoso Tariff Line';
    FIELDS
    {
        FIELD(1; "E-Mail"; Code[20])
        {
            caption = 'E-Mail';
        }
        FIELD(2; "Phone No."; Code[20])
        {
            caption = 'Phone No.';
        }
        FIELD(3; Address; Code[20])
        {
            caption = 'Address';
        }
        FIELD(4; City; Code[20])
        {
        }
        FIELD(5; "Country/Region Code"; Code[20])
        {
            caption = 'Country/Region Code';
        }
        FIELD(6; "Currency Code"; Code[20])
        {
            caption = 'Currency Code';
        }
        FIELD(7; Blocked; Code[20])
        {
            caption = 'Blocked';
        }
        FIELD(8; "Last Date Modified"; Code[20])
        {
            caption = 'Last Date Modified';
        }
        FIELD(9; Weight; Code[20])
        {
        }
    }
}

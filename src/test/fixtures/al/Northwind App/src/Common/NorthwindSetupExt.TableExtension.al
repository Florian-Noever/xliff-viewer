namespace Northwind.Common;

using Shared.Utilities;

tableextension 70060 "Northwind Setup Ext." extends "Northwind Setup"
{
    // Kept apart from the { braces } below; none of this is structure.
    fields
    {
        field(1; "Region Code"; Code[20])
        {
            Caption = 'Region Code';
        }
    }
}

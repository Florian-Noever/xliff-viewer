import type { AlDeclaration } from './alOutline';

/**
 * Which AL declarations a trans-unit id's segment types stand for.
 *
 * An id names a member by the kind of symbol it is — `Field`, `Control`, `Action` — while
 * the source spells it with a keyword inside a section: a page's `field(…)` in `layout` is
 * a `Control`, a table's `field(…)` in `fields` is a `Field`, and `group(…)` is a `Control`
 * in `layout` but an `Action` in `actions`. Segment types map to keywords by lowercasing —
 * `TableExtension` is `tableextension` — so objects need no table.
 */

interface MemberKind {
    readonly keywords: ReadonlySet<string>;
    /** The sections the member may sit in; absent when any section will do. */
    readonly sections?: ReadonlySet<string>;
}

const member = (keywords: readonly string[], sections?: readonly string[]): MemberKind => (
    sections === undefined ? { keywords: new Set(keywords) } : { keywords: new Set(keywords), sections: new Set(sections) }
);

const MEMBER_KINDS: Readonly<Record<string, MemberKind>> = {
    Field: member(['field'], ['fields']),
    Control: member(['field', 'group', 'part', 'systempart', 'usercontrol', 'repeater', 'cuegroup', 'grid', 'fixed', 'label', 'chartpart', 'area'], ['layout']),
    Action: member(['action', 'actionref', 'customaction', 'fileuploadaction', 'systemaction', 'separator', 'group', 'area'], ['actions']),
    Change: member(['modify']),
    EnumValue: member(['value']),
    ReportDataItem: member(['dataitem'], ['dataset']),
    ReportColumn: member(['column'], ['dataset']),
    QueryDataItem: member(['dataitem'], ['elements']),
    QueryColumn: member(['column'], ['elements']),
    QueryFilter: member(['filter'], ['elements']),
    XmlPortNode: member(['textelement', 'tableelement', 'fieldelement', 'textattribute', 'fieldattribute'], ['schema']),
    ReportLayout: member(['layout'], ['rendering']),
    View: member(['view'], ['views']),
    FieldGroup: member(['fieldgroup'], ['fieldgroups']),
    Key: member(['key'], ['keys']),
};

/**
 * Members that declare nothing of their own: their argument names what they move or where
 * they add, and what they contain belongs to the object.
 */
const TRANSPARENT = new Set(['add', 'addafter', 'addbefore', 'addfirst', 'addlast', 'moveafter', 'movebefore', 'movefirst', 'movelast']);

/** The properties AL translates, by their canonical names — what a `Property` segment hashes. */
export const TRANSLATABLE_PROPERTIES: readonly string[] = [
    'Caption', 'OptionCaption', 'InstructionalText', 'PromotedActionCategories', 'AdditionalSearchTerms',
    'EntityCaption', 'EntitySetCaption', 'ToolTip', 'AboutText', 'AboutTitle', 'RequestFilterHeading', 'Summary',
    'ProfileDescription',
];

const CANONICAL_PROPERTIES = new Map(TRANSLATABLE_PROPERTIES.flatMap(name => [
    [name.toLowerCase(), name],
    [`${name.toLowerCase()}ml`, name],
] as const));

/**
 * The canonical name of a translatable property as written in source — `tooltip` and
 * `ToolTipML` are both `ToolTip` — or undefined for any other property.
 */
export function canonicalPropertyName(declared: string): string | undefined {
    return CANONICAL_PROPERTIES.get(declared.toLowerCase());
}

/** The keyword that declares an object of this segment type. */
export function objectKeyword(segmentType: string): string {
    return segmentType.toLowerCase();
}

/** What an extension object's keyword extends — `pageextension` extends `page`. */
export const EXTENDED_KEYWORD: Readonly<Record<string, string>> = {
    tableextension: 'table',
    pageextension: 'page',
    pagecustomization: 'page',
    reportextension: 'report',
    enumextension: 'enum',
    permissionsetextension: 'permissionset',
    profileextension: 'profile',
};

/** True when the declaration is a member of the kind the segment type names. */
export function declaresMember(declaration: AlDeclaration, segmentType: string): boolean {
    const kind = MEMBER_KINDS[segmentType] as MemberKind | undefined;
    return kind !== undefined
        && kind.keywords.has(declaration.keyword)
        && (kind.sections === undefined || (declaration.section !== undefined && kind.sections.has(declaration.section)));
}

/** True for a member whose children belong to what contains it. */
export function isTransparent(declaration: AlDeclaration): boolean {
    return TRANSPARENT.has(declaration.keyword);
}

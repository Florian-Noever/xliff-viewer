/**
 * AL source for an invented app, written from the same model its trans-units come from, with
 * the place every unit is declared recorded as its declaring token is written — so where a
 * unit should be found is known by construction, not computed a second time.
 *
 * Deliberately not uniform. The style varies from file to file the way it does across a real
 * app — keyword and property case, line endings, comments holding braces, `#if` blocks,
 * attributes, several objects in one file — so the outline is tested on what source looks
 * like rather than on one layout.
 */

import { appUnits } from './alApp';

import type { AlApp, AlLabel, AlMember, AlMethod, AlObject, AlProperty, AppUnit } from './alApp';

export const Precision = {
    exact: 'exact',
    member: 'member',
    object: 'object',
} as const;
export type Precision = typeof Precision[keyof typeof Precision];

export interface ExpectedLocation {
    /** Relative to the app's folder: `src/ContosoSetup.Table.al`. */
    readonly file: string;
    /** Where the declaring token starts. */
    readonly offset: number;
    readonly precision: Precision;
}

export interface RenderedFile {
    /** Relative to the app's folder. */
    readonly path: string;
    readonly text: string;
}

export interface RenderedApp {
    readonly files: readonly RenderedFile[];
    /** Unit id → where it is declared. */
    readonly expected: ReadonlyMap<string, ExpectedLocation>;
    /** The preprocessor symbols the app's `app.json` defines. */
    readonly symbols: readonly string[];
}

export interface AppManifest {
    readonly id: string;
    readonly publisher: string;
    readonly features: readonly string[];
}

/** Defined by every rendered app, so an `#if CLEAN` keeps its first branch. */
const SYMBOLS = ['CLEAN'];

interface Piece {
    readonly text: string;
    /** The model elements this token declares. */
    readonly elements?: readonly object[];
    readonly precision?: Precision;
}

type Part = string | Piece;

class SourceWriter {
    private readonly eol: string;
    private readonly onMark: (element: object, offset: number, precision: Precision) => void;
    private text = '';

    public constructor(eol: string, onMark: (element: object, offset: number, precision: Precision) => void) {
        this.eol = eol;
        this.onMark = onMark;
    }

    public get content(): string {
        return this.text;
    }

    public line(depth: number, ...parts: readonly Part[]): void {
        this.text += '    '.repeat(depth);
        for (const part of parts) {
            if (typeof part === 'string') {
                this.text += part;
                continue;
            }
            for (const element of part.elements ?? []) {
                this.onMark(element, this.text.length, part.precision ?? Precision.exact);
            }
            this.text += part.text;
        }
        this.text += this.eol;
    }

    /** A line at column zero, as a directive is written. */
    public directive(text: string): void {
        this.text += text + this.eol;
    }

    public blank(): void {
        this.text += this.eol;
    }
}

interface Style {
    readonly eol: string;
    readonly keyword: (word: string) => string;
    readonly property: (name: string) => string;
    readonly trigger: (name: string) => string;
    readonly comments: boolean;
    readonly conditional: boolean;
    readonly attributes: boolean;
}

function styleFor(index: number): Style {
    const casing = index % 3;
    return {
        eol: index % 2 === 0 ? '\r\n' : '\n',
        keyword: word => (casing === 0 ? word.toLowerCase() : casing === 1 ? word : word.toUpperCase()),
        property: name => (index % 4 === 1 ? name.toLowerCase() : name),
        trigger: name => (index % 3 === 1 ? name.toLowerCase() : name),
        comments: index % 5 === 0,
        conditional: index % 7 === 3,
        attributes: index % 4 === 2,
    };
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A name as AL source writes it: bare when it can be, quoted otherwise. */
function nameOf(name: string): string {
    return IDENTIFIER.test(name) ? name : `"${name}"`;
}

function literal(text: string): string {
    return `'${text.replace(/'/g, '\'\'')}'`;
}

function sanitize(name: string): string {
    return name.replace(/[^A-Za-z0-9]/g, '');
}

/** One file's objects, and where the file goes. */
interface FilePlan {
    readonly path: string;
    readonly namespace?: string;
    readonly objects: AlObject[];
}

/** One file per object, except enums, which share one file per namespace. */
function planFiles(app: AlApp): FilePlan[] {
    const plans: FilePlan[] = [];
    const enums = new Map<string, FilePlan>();

    for (const object of app.objects) {
        const folder = object.namespace === undefined ? 'src' : `src/${object.namespace.split('.').at(-1) ?? object.namespace}`;
        if (object.kind === 'Enum' || object.kind === 'EnumExtension') {
            const key = object.namespace ?? '';
            const plan = enums.get(key);
            if (plan === undefined) {
                const created: FilePlan = { path: `${folder}/Enums.al`, namespace: object.namespace, objects: [object] };
                enums.set(key, created);
                plans.push(created);
            } else {
                plan.objects.push(object);
            }
            continue;
        }
        plans.push({ path: `${folder}/${sanitize(object.name)}.${object.kind}.al`, namespace: object.namespace, objects: [object] });
    }

    return plans;
}

/** Renders every file of an app, `app.json` first. */
export function renderApp(app: AlApp, manifest: AppManifest): RenderedApp {
    const units = appUnits(app);
    const unitOf = new Map<object, AppUnit>(units.map(unit => [unit.element, unit]));
    const expected = new Map<string, ExpectedLocation>();
    const files: RenderedFile[] = [{
        path: 'app.json',
        text: `${JSON.stringify({
            id: manifest.id,
            name: app.name,
            publisher: manifest.publisher,
            version: '1.0.0.0',
            features: manifest.features,
            preprocessorSymbols: SYMBOLS,
        }, null, 2)}\n`,
    }];

    planFiles(app).forEach((plan, index) => {
        const style = styleFor(index);
        const writer = new SourceWriter(style.eol, (element, offset, precision) => {
            const unit = unitOf.get(element);
            if (unit !== undefined) {
                expected.set(unit.id, { file: plan.path, offset, precision });
            }
        });

        if (plan.namespace !== undefined) {
            writer.line(0, `${style.keyword('namespace')} ${plan.namespace};`);
            writer.blank();
            writer.line(0, `${style.keyword('using')} Shared.Utilities;`);
            writer.blank();
        }
        plan.objects.forEach((object, position) => {
            if (position > 0) {
                writer.blank();
            }
            renderObject(writer, object, style);
        });
        files.push({ path: plan.path, text: writer.content });
    });

    return { files, expected, symbols: SYMBOLS };
}

function renderObject(writer: SourceWriter, object: AlObject, style: Style): void {
    const keyword = style.keyword(object.kind.toLowerCase());
    const synthesized = object.properties.filter(property => property.synthesized === true);
    const target = object.extends === undefined ? '' : ` ${style.keyword('extends')} ${nameOf(object.extends.name)}`;

    writer.line(0, `${keyword} ${object.id} `, { text: nameOf(object.name), elements: synthesized, precision: Precision.object }, target);
    writer.line(0, '{');
    if (style.comments) {
        writer.line(1, '// Kept apart from the { braces } below; none of this is structure.');
    }
    renderProperties(writer, 1, object.properties, style, style.conditional);

    switch (object.kind) {
        case 'Table':
        case 'TableExtension':
            renderSection(writer, style, 'fields', object.members, (member, depth, index) => renderMember(writer, depth, style, member, `${style.keyword('field')}(${index + 1}; `, '; Code[20])'));
            break;
        case 'Page':
            renderPage(writer, style, object.members, false);
            break;
        case 'PageExtension':
            renderPage(writer, style, object.members, true);
            break;
        case 'XmlPort':
            writer.line(1, style.keyword('schema'));
            writer.line(1, '{');
            writer.line(2, `${style.keyword('textelement')}(Root) { }`);
            writer.line(1, '}');
            break;
        default:
            for (const [index, member] of object.members.entries()) {
                renderMember(writer, 1, style, member, `${memberKeyword(member, style)}(${member.kind === 'EnumValue' ? `${index}; ` : ''}`, ')');
            }
            break;
    }

    if ((object.reportLabels ?? []).length > 0) {
        writer.line(1, style.keyword('labels'));
        writer.line(1, '{');
        for (const label of object.reportLabels ?? []) {
            writer.line(2, { text: nameOf(label.name), elements: [label] }, ` = ${literal(label.source)};`);
        }
        writer.line(1, '}');
    }
    for (const method of object.methods ?? []) {
        writer.blank();
        renderMethod(writer, 1, method, style);
    }
    if ((object.labels ?? []).length > 0) {
        writer.blank();
        renderVariables(writer, 1, object.labels ?? [], style);
    }
    writer.line(0, '}');
}

function memberKeyword(member: AlMember, style: Style): string {
    switch (member.kind) {
        case 'EnumValue':
            return style.keyword('value');
        case 'Change':
            return style.keyword('modify');
        default:
            return style.keyword(member.kind.toLowerCase());
    }
}

function renderPage(writer: SourceWriter, style: Style, members: readonly AlMember[], extension: boolean): void {
    const controls = members.filter(member => member.kind === 'Control');
    const actions = members.filter(member => member.kind === 'Action');

    if (controls.length > 0) {
        writer.line(1, style.keyword('layout'));
        writer.line(1, '{');
        writer.line(2, extension ? `${style.keyword('addlast')}(Content)` : `${style.keyword('area')}(Content)`);
        writer.line(2, '{');
        writer.line(3, `${style.keyword('group')}(General)`);
        writer.line(3, '{');
        for (const control of controls) {
            renderMember(writer, 4, style, control, `${style.keyword('field')}(`, `; Rec.${nameOf(control.name)})`);
        }
        writer.line(3, '}');
        writer.line(2, '}');
        writer.line(1, '}');
    }
    if (actions.length > 0) {
        writer.line(1, style.keyword('actions'));
        writer.line(1, '{');
        writer.line(2, extension ? `${style.keyword('addlast')}(Processing)` : `${style.keyword('area')}(Processing)`);
        writer.line(2, '{');
        for (const action of actions) {
            renderMember(writer, 3, style, action, `${style.keyword('action')}(`, ')');
        }
        writer.line(2, '}');
        writer.line(1, '}');
    }
}

function renderSection(
    writer: SourceWriter,
    style: Style,
    keyword: string,
    members: readonly AlMember[],
    render: (member: AlMember, depth: number, index: number) => void,
): void {
    if (members.length === 0) {
        return;
    }
    writer.line(1, style.keyword(keyword));
    writer.line(1, '{');
    members.forEach((member, index) => render(member, 2, index));
    writer.line(1, '}');
}

/** `field(1; "No."; Code[20]) { … }` — the name declares any caption the compiler synthesises. */
function renderMember(writer: SourceWriter, depth: number, style: Style, member: AlMember, before: string, after: string): void {
    const synthesized = member.properties.filter(property => property.synthesized === true);
    writer.line(depth, before, { text: nameOf(member.name), elements: synthesized, precision: Precision.member }, after);
    writer.line(depth, '{');
    renderProperties(writer, depth + 1, member.properties, style, false);
    for (const method of member.methods ?? []) {
        renderMethod(writer, depth + 1, method, style);
    }
    writer.line(depth, '}');
}

function renderProperties(writer: SourceWriter, depth: number, properties: readonly AlProperty[], style: Style, conditional: boolean): void {
    properties.filter(property => property.synthesized !== true).forEach((property, index) => {
        const line = (): void => writer.line(depth, { text: style.property(property.name), elements: [property] }, ` = ${literal(property.source)};`);
        if (conditional && index === 0) {
            writer.directive('#if CLEAN');
            line();
            writer.directive('#else');
            writer.line(depth, `${style.property(property.name)} = ${literal(`${property.source} (obsolete)`)};`);
            writer.line(depth, 'ObsoleteState = Pending;');
            writer.directive('#endif');
            return;
        }
        line();
    });
}

function renderMethod(writer: SourceWriter, depth: number, method: AlMethod, style: Style): void {
    if (method.apiCaption !== undefined) {
        writer.line(depth, '[ServiceEnabled]');
    } else if (method.kind === 'procedure' && style.attributes) {
        writer.line(depth, '[Scope(\'OnPrem\')]');
    }
    const name = method.kind === 'trigger' ? style.trigger(method.name) : nameOf(method.name);
    writer.line(depth, `${style.keyword(method.kind)} `, { text: name, elements: [method] }, '()');
    if (method.labels.length > 0) {
        renderVariables(writer, depth, method.labels, style);
    }
    writer.line(depth, style.keyword('begin'));
    writer.line(depth, `${style.keyword('end')};`);
}

function renderVariables(writer: SourceWriter, depth: number, labels: readonly AlLabel[], style: Style): void {
    writer.line(depth, style.keyword('var'));
    for (const label of labels) {
        const maxLength = label.maxLength === undefined ? '' : `, MaxLength = ${label.maxLength}`;
        writer.line(depth + 1, { text: nameOf(label.name), elements: [label] }, `: Label ${literal(label.source)}${maxLength};`);
    }
}

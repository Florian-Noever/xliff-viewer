# XLIFF Viewer

Open `.xlf` and `.xliff` translation files as a structured, themed GUI instead of raw XML. Built for Business Central / AL translation files, where a single file holds thousands of units and the trans-unit id already carries the object hierarchy — so the viewer shows objects, members and translated elements rather than one long list of `<trans-unit>` elements.

> **Read-only until you say otherwise.** A file opens as a viewer; editing is a toggle away, and when it is off the GUI says which of the three reasons applies. Writes go through VS Code's own edit machinery, so undo, dirty state and save behave exactly as they do in the text editor.

---

## ✨ Features

- **Structured tree** — object type → object → member → translated element, built from the trans-unit id rather than from the display note, so the grouping is exact even when two objects share a name
- **Object-type grouping** — the top level is `Tables (16)`, `PageExtensions (89)`, `Codeunits (15)`…, so a file's couple of hundred objects are navigable instead of one flat list
- **Rolled-up state** — every container shows a progress bar coloured by its *worst* descendant, not by its percentage: 99 % done with one missing target is not the same as 99 % done with one needing review
- **Every field shown** — source, target, `maxwidth`, `size-unit`, `al-object-target`, `translate="no"`, every `<note>`, and a state the spec does not define is shown as the file wrote it
- **Search** — over id, names, source, target and notes, with `*` wildcards (`Setup*`, `*caption*`); a matching unit brings its whole path into view
- **State filter** — chips for the states the file actually contains, driven by the same roll-up the header shows
- **Base-file pairing** — resolves the `.g.xlf` for a language file and marks units the base no longer has (*orphaned*) or whose source has since changed
- **Go to source** — opens the resolved base file at the same unit
- **Edit mode** — opt-in per window: type a target, pick a state, and let the state follow the edit. Writes go through a `WorkspaceEdit`, so one typed translation is one undo step
- **Validation hints** — a target past its `maxwidth`, a placeholder the translation lost or invented, an empty target the file calls finished. Advisory: they never block an edit or change a value, and a container says how many translations beneath it are worth a look
- **Load-bearing whitespace** — a target that is only a space, or whose edges differ from the source, is marked and explained; `xml:space="preserve"` means those spaces are the translation
- **Multi-`<file>` documents** — a switcher, with each file remembering its own expansion
- **Reopen as XML** — the editor registers at `default` priority, so *Reopen Editor With… → Text Editor* is always there
- **Comes back where you left it** — hiding a tab and returning to it keeps the expansion, the focused row, the scroll position, the search, the filter and the edit toggle
- **Desktop and web** — the same extension runs in VS Code and in `vscode.dev` / `github.dev`

---

## 🧰 Usage

Open any `.xlf` or `.xliff` file. The viewer replaces the text editor automatically.

- **Header** — the app the file translates, its languages, unit count, resolved base file, and the whole file's progress
- **Toolbar** — search, state chips, expand / collapse all, and the edit toggle
- **Tree** — click a container row anywhere to open or close it; unit rows are content, not controls

Each unit renders as a labelled box:

```text
Property
┌ Caption                          ● translated ┐   Go to source
│ Original     ExampleSourceText                │
│ [ de-DE ]    ExampleTranslation               │
└───────────────────────────────────────────────┘
  Developer    de-DE=ExampleTranslation
```

The legend names the translated element and carries its state. `Original` is the source; the bracketed row is the translation, labelled with the file's target language.

### Editing

Turn editing on with the toolbar toggle, or start every file that way with `xliffViewer.editMode`.

- The translation row becomes a field. It is committed when you leave it, not on every keystroke, so `Ctrl+Z` undoes a translation rather than a letter
- `Escape` abandons what you typed and puts the committed value back
- The field is as wide as what it holds and grows as you add lines; drag its lower edge for more room
- Editing a target sets its state to `xliffViewer.stateOnEdit`; clearing one always sets `needs-translation`. Picking a state yourself overrides both
- A base file (`.g.xlf`) is never editable — it is the generator's output. The GUI says so rather than showing a dead field

### Search tips

- Plain text (`caption`) — matches anywhere in id, names, source, target or notes, case-insensitively
- Leading wildcard (`*setup`) — matches anything ending in the term
- Trailing wildcard (`Table *`) — matches anything starting with it
- Both (`*name*`) — the same as a plain substring match
- Everything else is literal, so a query full of `.` and `(` from a source string still finds it

---

## ⌨️ Keyboard Shortcuts

| Key                | Action                                                       |
| ------------------ | ------------------------------------------------------------ |
| `Ctrl+F` / `Cmd+F` | Focus the search box                                         |
| `Escape`           | Clear the search (while the box is focused)                  |
| `↑` `↓`            | Move through the visible rows                                |
| `→`                | Open a closed row, or step into its first child              |
| `←`                | Close an open row, or step out to its parent                 |
| `Home` / `End`     | Jump to the first / last row                                 |
| `Enter` / `Space`  | Open or close the focused row                                |

Keys typed into a field belong to the field, not to the tree.

The tree is a single tab stop with the arrow keys moving inside it, which is how an ARIA tree behaves. Everything interactive has a name, nothing animates when your system asks it not to, and the signals that are colours also carry a word or a number.

---

## ⚙️ Settings

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| `xliffViewer.baseFile` | `string` | `""` | An explicit base-file path or glob. Empty means "work it out" — see below |
| `xliffViewer.showDeveloperNotes` | `boolean` | `true` | Show `Developer` notes and the suggestion parsed out of them |
| `xliffViewer.showGeneratorNotes` | `boolean` | `false` | Show the `Xliff Generator` note, rebuilt from the tree |
| `xliffViewer.defaultExpandDepth` | `number` | `1` | How many levels of real structure a file opens to |
| `xliffViewer.editMode` | `boolean` | `false` | Open files with editing already on, instead of read-only |
| `xliffViewer.stateOnEdit` | `string` | `translated` | The state a target moves to when it is edited. Clearing a target always sets `needs-translation` |
| `xliffViewer.validation.enabled` | `boolean` | `true` | Show the validation hints. Malformed XML is rejected regardless — that is not a hint |
| `xliffViewer.validation.sameAsSource` | `boolean` | `false` | Also hint when a target repeats its source. Off by default: in a real translation file a tenth of the units are legitimately identical |

### How the base file is found

For `<App>.<lang>.xlf`, in order, first hit wins:

1. `xliffViewer.baseFile` — absolute path, workspace-relative path, or glob
2. `xliffSync.baseFile`, if the XLIFF Sync extension has it set — read defensively, never written
3. The sibling `<App>.g.xlf`
4. Any `*.g.xlf` in the same folder
5. Any `*.g.xlf` under a `Translations/` folder in the workspace, preferring the one named after this app

Not finding one is a normal state, not an error: the viewer works fully without a base file and the affordances that need one say why they are disabled. NAB AL Tools has no base-file setting to read — it uses the same convention steps 3–5 already implement.

---

## 🚦 Status

Not published, and buildable into an installable VSIX today: `npm run package` writes one at the repository root.

| Phase | State |
| --- | --- |
| Toolchain | ✅ complete |
| Data layer — parse, validate, serialise, byte-identical round trip | ✅ complete |
| Read-only GUI | ✅ complete |
| Search, filter, base file, navigation | ✅ complete |
| Edit mode | ✅ complete |
| Validation hints | ✅ complete |
| Accessibility and keyboard | ✅ complete |
| View-state persistence | ✅ complete |
| Packaging | ✅ complete |

---

## 📦 Installing a build

```bash
npm run package
```

That writes `xliff-viewer-<version>.vsix`. Install it with *Extensions → … → Install from VSIX…*, or:

```bash
code --install-extension xliff-viewer-0.0.1.vsix
```

The VSIX carries the two host bundles, the webview bundle and its HTML shell, and nothing else — no sources, no tests and none of the example translation files.

---

## 🛠️ Developer Notes

### Architecture

| Layer | Technology | Purpose |
| --- | --- | --- |
| Extension host | TypeScript, esbuild → two CJS bundles | Parses the XLIFF, resolves the base file, owns navigation. One entry, built for both `node` and `browser`, so the same source runs on the desktop and on the web |
| Shared | TypeScript | The model, the state domain, the DTOs and both message unions — imported by both runtimes, so there is one definition rather than two |
| Webview | Vue 3, Vite, `@tanstack/vue-virtual` | The tree, virtualised. Rolls up state, searches and filters over the DTOs already in memory; no round trip to the host for a keystroke |

The XML is parsed **once, in the host** — the webview never sees it. The whole document is read and written as one string with a format-faithful serialiser, verified byte-identical against every file in `Examples/`.

### Build commands

npm, and nothing else — packaging needs it regardless, since `vsce` shells out to it.

```bash
npm ci                   # install exactly what package-lock.json pins

npm run compile          # check-types + lint + esbuild (both targets) + vite build
npm run watch            # all four watchers, which is what F5 starts
npm run check-types      # tsc for the host and tests, vue-tsc for the webview
npm run lint             # eslint src
npm test                 # vitest: data, host, webview, then the perf budgets
npm run test:integration # @vscode/test-electron and @vscode/test-web
npm run dev:webview      # the webview alone, against a real corpus fixture
npm run package          # vsce package
```

`npm run dev:webview` serves the UI with no extension host behind it, rendering a real projection of one of the corpus files. A drift test rebuilds that fixture from the corpus and fails if it has been hand-edited, so the dev server always shows what the extension actually sends.

**Install scripts are opt-in.** npm 11 runs a dependency's install script only when `allowScripts` in `package.json` approves it. Two are: `@playwright/browser-chromium`, which downloads the browser the web integration tests run in, and `esbuild`. Without the first, those tests cannot start — and they **hang** rather than fail, so if they ever sit silent after a dependency update, check `npm install-scripts ls` first. `keytar` and `@vscode/vsce-sign` are denied: they serve publishing, which this project does not do.

### Tests

Four Vitest projects: `data` (pure, and deliberately *without* a `vscode` alias, so a data test that imports it fails to resolve), `host` (a hand-written `vscode` mock), `webview` (jsdom), and `perf` (the wall-clock budgets, run serially so they measure the code rather than the load).

---

## 📜 License

[MIT](LICENSE).

The extension's own icons are in `assets/`. The in-GUI icons are from [`@vscode/codicons`](https://github.com/microsoft/vscode-codicons), licensed [CC BY 4.0](https://github.com/microsoft/vscode-codicons/blob/main/LICENSE).

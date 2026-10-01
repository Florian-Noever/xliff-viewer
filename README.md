# XLIFF Viewer

Open `.xlf` and `.xliff` translation files as a structured, themed GUI instead of raw XML. Built for Business Central / AL translation files, where a single file holds thousands of units and the trans-unit id already carries the object hierarchy — so the viewer shows objects, members and translated elements rather than one long list of `<trans-unit>` elements.

> **Read-only until you say otherwise.** A file opens as a viewer; editing is a toggle away, and when it is off the GUI says which of the three reasons applies. Writes go through VS Code's own edit machinery, so undo, dirty state and save behave exactly as they do in the text editor.

---

## ✨ Features

- **Structured tree** — object type → object → member → translated element, built from the trans-unit id rather than from the display note, so the grouping is exact even when two objects share a name
- **Object-type grouping** — the top level is `Pages (40)`, `PageExtensions (60)`, `Codeunits (40)`…, so an app's hundreds of objects are navigable instead of one flat list
- **Namespaced apps** — the readable, namespaced ids AL 18 writes under `TranslationsWithNamespaces` build the same exact tree, with a namespace level above the object types. An object whose ids come in both readable and hashed form — AL falls back to hashes for long or non-ASCII ids — is still one node
- **Rolled-up state** — every container shows a progress bar coloured by its *worst* descendant, not by its percentage: 99 % done with one missing target is not the same as 99 % done with one needing review
- **Every field shown** — source, target, `maxwidth`, `size-unit`, `al-object-target`, `translate="no"`, every `<note>`, and a state the spec does not define is shown as the file wrote it
- **Search** — over id, names, source, target and notes, with a `*` wildcard within a field (`Contoso*Name`); a matching unit brings its whole path into view
- **State filter** — chips for the states the file actually contains, driven by the same roll-up the header shows
- **Base-file pairing** — resolves the `.g.xlf` for a language file and marks units the base no longer has (*orphaned*) or whose source has since changed
- **Go to source** — opens the AL source that declares the unit, with the `Caption`, `ToolTip` or label itself selected — or the member or object that declares it, when the source has no line for the unit. When the app's source does not declare it, the unit opens in the base file instead, with a notice that closes itself. The button's tooltip says which it will be. No AL tooling needed, on the desktop or the web
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
- A file this editor cannot write back without losing something — an XLIFF `<header>`, inline tags such as `<x/>`, comments, CDATA — opens read-only and says why; edit it as text instead

### Search tips

- Plain text (`caption`) — matches anywhere in the id, names, source, target or notes, ignoring case
- `*` stands for any run of characters within one field (`Contoso*Name`), so a `*` at the start or end of a query changes nothing
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
| `xliffViewer.showDeveloperNotes` | `boolean` | `true` | Show `Developer` notes, and the suggestion they make for the file's language |
| `xliffViewer.showGeneratorNotes` | `boolean` | `false` | Show the `Xliff Generator` note, rebuilt from the tree |
| `xliffViewer.defaultExpandDepth` | `number` | `1` | How many levels of real structure a file opens to |
| `xliffViewer.editMode` | `boolean` | `false` | Open files with editing already on, instead of read-only |
| `xliffViewer.stateOnEdit` | `string` | `translated` | The state a target moves to when it is edited. Clearing a target always sets `needs-translation` |
| `xliffViewer.validation.enabled` | `boolean` | `true` | Show the validation hints. Malformed XML is rejected regardless — that is not a hint |
| `xliffViewer.validation.sameAsSource` | `boolean` | `false` | Also hint when a target repeats its source. Off by default: proper nouns, identifiers and captions legitimately read the same in both languages |

### How the base file is found

For `<App>.<lang>.xlf`, in order, first hit wins:

1. `xliffViewer.baseFile` — absolute path, workspace-relative path, or glob
2. `xliffSync.baseFile`, if the XLIFF Sync extension has it set — read defensively, never written
3. The sibling `<App>.g.xlf`
4. Any `*.g.xlf` in the same folder
5. Any `*.g.xlf` under a `Translations/` folder in the workspace, preferring the one named after this app

In Restricted Mode a workspace's own `xliffViewer.baseFile` and XLIFF Sync's workspace value are ignored; your user settings still count.

Not finding one is a normal state, not an error: the viewer works fully without a base file and the affordances that need one say why they are disabled. NAB AL Tools has no base-file setting to read — it uses the same convention steps 3–5 already implement.

### How "Go to source" finds the AL source

- **Where it looks.** It searches the app the translation file belongs to: the nearest folder above it that holds an `app.json`, else the workspace folder. `node_modules`, `.alpackages`, `.snapshots` and hidden folders are skipped. The app's `preprocessorSymbols` decide which side of an `#if` counts.
- **How it matches.** The numbers in a trans-unit id are AL's hash of each name. Every candidate declaration is checked against them, so a match is exact, never a guess by name.
- **Several equally good matches** — two apps in one workspace, say — are offered to choose from.
- **Your edits count.** An AL file open with unsaved edits is read as it stands in the editor.
- **Always fresh.** The index of objects is built on the first click and kept current as files change.

---

## 📦 Installing

Install **XLIFF Viewer** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Florian-Noever.xliff-viewer) or from [Open VSX](https://open-vsx.org/extension/Florian-Noever/xliff-viewer), or from the command line:

```bash
code --install-extension Florian-Noever.xliff-viewer
```

Every [GitHub release](https://github.com/Florian-Noever/xliff-viewer/releases) also carries its VSIX, for *Extensions → … → Install from VSIX…*. `npm run package` builds one from source as `xliff-viewer-<version>.vsix`.

The VSIX carries the two host bundles, the webview bundle and its HTML shell, and nothing else — no sources and no tests.

---

## 🧩 Repository

GitHub: [Florian-Noever/xliff-viewer](https://github.com/Florian-Noever/xliff-viewer)

Bug reports and feature requests are welcome via [Issues](https://github.com/Florian-Noever/xliff-viewer/issues).

---

## 🛠️ Developer Notes

### Architecture

| Layer | Technology | Purpose |
| --- | --- | --- |
| Extension host | TypeScript, esbuild → two CJS bundles | Parses the XLIFF, resolves the base file, scans the app's AL source, owns navigation. One entry, built for both `node` and `browser`, so the same source runs on the desktop and on the web |
| Shared | TypeScript | The model, the state domain, the DTOs and both message unions — imported by both runtimes, so there is one definition rather than two |
| Webview | Vue 3, Vite, `@tanstack/vue-virtual` | The tree, virtualised. Rolls up state, searches and filters over the DTOs already in memory; no round trip to the host for a keystroke |

The XML is parsed **once, in the host** — the webview never sees it. The whole document is read and written as one string with a format-faithful serialiser, verified byte-identical against a fixture corpus written in the exact shape the AL compiler emits.

### Build commands

npm, and nothing else — packaging needs it regardless, since `vsce` shells out to it.

```bash
npm ci                   # install exactly what package-lock.json pins

npm run compile          # check-types + lint + esbuild (both targets) + vite build
npm run watch            # all four watchers, which is what F5 starts
npm run check-types      # tsc for the host and tests, vue-tsc for the webview
npm run lint             # eslint src, with no warning allowed
npm test                 # build, then vitest: data, host, webview, repo and the perf budgets
npm run test:integration # build, then @vscode/test-electron and @vscode/test-web
npm run dev:webview      # the webview alone, against a fixture document
npm run package          # vsce package
```

`npm run dev:webview` serves the UI with no extension host behind it, rendering a projection of the largest fixture file. A drift test rebuilds that document from the file and fails if it has been hand-edited, so the dev server always shows what the extension actually sends.

**Install scripts are opt-in.** npm 11 runs a dependency's install script only when `allowScripts` in `package.json` approves it. Two are: `@playwright/browser-chromium`, which downloads the browser the web integration tests run in, and `esbuild`. Without the first, those tests cannot start — and they **hang** rather than fail, so if they ever sit silent after a dependency update, check `npm install-scripts ls` first. `@vscode/vsce-sign` is denied: packaging does not need it, and releases are published by CI. So is `unrs-resolver`, whose script only re-checks a native binding that already arrives as a locked optional package.

### Tests

Five Vitest projects: `data` (pure, and deliberately *without* a `vscode` alias, so a data test that imports it fails to resolve), `host` (a hand-written `vscode` mock), `webview` (jsdom), `repo` (checks on the repository rather than the code: the manifest, the docs, the webview's sources and what the package ships, which needs a build), and `perf` (the wall-clock budgets, run serially so they measure the code rather than the load).

The XLIFF the tests read is invented. `src/test/fixtures/corpus.ts` generates every file in `src/test/fixtures/xliff/` in the exact shape the AL compiler writes, along with the AL source of its apps in `src/test/fixtures/al/`, and the dev server's documents in `src/webview/fixtures/` are built from the same corpus. A test fails if a committed file drifts from what is generated. After changing a generator, rewrite the files with the command below; the `data` project writes them once, before any of its tests run (in PowerShell, set `$env:UPDATE_FIXTURES = '1'` first and run the command without the prefix):

```bash
UPDATE_FIXTURES=1 npx vitest run --project data
```

### CI & Releases

CI runs on every push and pull request through the shared workflows of [Florian-Noever/Florian-Noever](https://github.com/Florian-Noever/Florian-Noever/blob/main/.github/CI.md). One job type-checks, lints and runs the `data`, `host` and `webview` tests; a second runs the integration tests in the desktop and the web host; a third packs a preview VSIX. The perf budgets stay out of CI, since shared runners are slower and noisier than the machines the budgets were set on, so run `npm test` locally before a release.

To release, bump the version with `npm version x.y.z --no-git-tag-version` and publish a GitHub release `vx.y.z` from a commit whose CI is green. The publish workflow builds and tests the tag, attaches the VSIX to the release and publishes it to the Visual Studio Marketplace and Open VSX.

---

## 📜 License

[MIT](LICENSE).

The extension's own icons are in `assets/`. The in-GUI icons are from [`@vscode/codicons`](https://github.com/microsoft/vscode-codicons), licensed [CC BY 4.0](https://github.com/microsoft/vscode-codicons/blob/main/LICENSE).

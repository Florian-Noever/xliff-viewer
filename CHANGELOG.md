# Changelog

All notable changes to **XLIFF Viewer** are documented in this file.

---

## [Unreleased]

Nothing has been published yet. This section is what the extension does today; it becomes the first release entry when one is cut.

### Added

**The editor**
- Custom editor for `.xlf` and `.xliff`, registered at `default` priority so *Reopen Editor With… → Text Editor* stays available
- Wraps VS Code's own `TextDocument`, so dirty state, undo/redo, save and hot exit come from the editor rather than from a private model
- Runs on the **desktop and the web** from one source: two esbuild bundles from one entry, and no node builtin anywhere in `src/`
- One parse per document, shared by every editor showing it — two tabs on one file do not parse it twice per keystroke
- An external edit re-parses after a 150 ms trailing debounce; a re-parse that fails keeps the last good document behind the error rather than blanking the view
- Error pane with the line and column, and an *Open as text* that works precisely when nothing parsed

**The data layer**
- XLIFF 1.2 parsed with `fast-xml-parser` in `preserveOrder` mode, which is what makes a byte-faithful serialiser possible
- **Validated before every parse.** `XMLParser` recovers silently from unclosed tags, mismatched tags, truncated documents and unquoted attributes; with a whole-file writer, a silent mis-parse would rewrite the document. A file that fails validation is never written
- The document's own formatting is a fact to reproduce, not to normalise: BOM, XML declaration, line ending and trailing newline are all captured and replayed
- **Byte-identical round trip** — parse then serialise reproduces every file in `Examples/` exactly, asserted per file
- Whole-document writes are trimmed against the current text into a minimal `TextEdit`, so a one-word change is a one-line edit

**The tree**
- Hierarchy built from the trans-unit **id**, never from the display note: object → member → translated element, at any depth
- Display names come from the `Xliff Generator` note through an anchored regex keyed on the id's segment types — exact for **100 %** of both large corpus files, including object names that contain the ` - ` separator
- Objects are grouped by symbol type: `Tables (16)`, `PageExtensions (89)`, first-appearance order
- **Rolled-up state** on every container, coloured by the worst translatable descendant rather than by the percentage; `translate="no"` units are excluded from the roll-up but still shown
- Two synthetic states beyond the spec's ten: `missing` (no `<target>` at all) and `empty` (a `<target>` with no text). A target that carries text but declares no state is `unknown` rather than assumed done
- Virtualised with measured row heights, so a 2 511-unit file scrolls at full speed
- A file whose ids carry no AL structure falls back to a flat list, and says so once

**The unit**
- Each unit is a labelled box: the translated element's name and state on the legend, then `Original` and the target language as label/value rows
- Every field the file carries is shown — `maxwidth`, `size-unit`, `al-object-target`, `translate="no"`, and a `state` the spec does not define, rendered as the file wrote it
- All `<note>` elements, whatever tool wrote them; an empty `Developer` note is shown as empty rather than dropped
- The `Developer` note's `xx-XX=` suggestion is surfaced separately, and suppressed where the translator already used it
- **Load-bearing whitespace is marked and explained** — a target that is only a space, or whose edges differ from the source, is not a formatting artefact under `xml:space="preserve"`

**Search and filter**
- Search over id, names, source, target and notes, case-insensitive, with `*` wildcards and everything else literal
- State filter chips, driven by the same roll-up the header shows
- One ancestor rule shared by both: a matching unit brings its whole path into view, and the two compose at the node rather than by intersecting results
- The user's own expansion is untouched while filtering, so `Escape` puts the tree back exactly as it was
- Expand all / collapse all, honouring an active filter

**Base file and navigation**
- Resolves the `.g.xlf` for a language file in five steps — our setting, XLIFF Sync's setting, the sibling, the folder, then `Translations/` — preferring the base file named after the app when several are in reach
- Third-party settings are read defensively and **never written**; a missing or renamed key is "not configured", never an error
- Units the base file no longer carries are marked *orphaned*; units whose source has since changed show what the base now says
- Markers travel as a patch, so a translation in step with its base costs nothing on the wire
- *Go to source* opens the base file at the same unit
- Both caches are watcher-driven: regenerating the base file while a translation is open re-marks it

**Edit mode**
- Off by default and opt-in per window; when it is off, the reason is stated — a base file, a read-only document, or simply the toggle
- Targets are written through a `WorkspaceEdit`, never to disk, so one typed translation is one undo step and saving is VS Code's business
- A missing `<target>` is inserted, and clearing one writes the self-closing form AL itself emits
- The state follows the edit — `stateOnEdit` by default, a state the translator picked instead, and `needs-translation` whenever the target is cleared
- Our own edit is recognised by its span and text, so the view is patched in place rather than rebuilt: focus, scroll and expansion survive typing
- The target field takes the space it needs, grows as lines are added, and cannot be dragged shorter than what it holds
- A file that begins with a UTF-8 BOM says so once when first edited: VS Code drops the mark when it saves, and an extension cannot stop it

**Settings**
- `xliffViewer.baseFile`, `showDeveloperNotes`, `showGeneratorNotes`, `defaultExpandDepth`, `editMode` and `stateOnEdit` all take effect immediately
- `validation.enabled` is declared but reserved — the in-GUI validation hints are not built

**Performance**
- Every wall-clock budget is an assertion in a serial test project rather than a claim: opening the 1.34 MB / 2 511-unit corpus file takes 86 ms host-side against a 250 ms budget, a keystroke filters the tree in 0.5 ms against 50 ms, and the payload is 1 220 KB from a 1 340 KB source

### Known limitations

- **A document containing an XML comment cannot be edited.** The parser drops comments, and a whole-document write would delete one a person added by hand, so such a file is refused rather than silently rewritten. No AL-generated file contains one
- **Validation hints are not built.** Nothing warns yet about a target past its `maxwidth`, a placeholder the translation lost, or an empty target claiming to be translated
- `<alt-trans>`, `<context-group>` and inline tags (`<g>`, `<ph>`) are not modelled. None occurs anywhere in the corpus
- The webview has not been confirmed inside VS Code for the Web. The editor binds correctly there and the same bundle renders correctly when served directly, but the automated browser cannot register that host's webview service worker

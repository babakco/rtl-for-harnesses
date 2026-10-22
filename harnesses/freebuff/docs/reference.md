# Freebuff Desktop — RTL + Vazirmatn Patch

Patch that adds **Persian/Arabic RTL text rendering** to the Freebuff Desktop GUI
and makes **Farsi/Arabic glyphs render with the Vazirmatn** variable font.
English/Latin keeps using the built-in Inter font. **The overall app layout stays LTR.**

## 🖥️ Two editions side by side

`patch/patch.sh` **never modifies the original app**. It copies it to a
separate RTL edition and patches only the copy:

| Edition | Path | Bundle id | Role |
|---|---|---|---|
| Original | `/Applications/Freebuff.app` | `com.freebuff.desktop` | stays pristine — install updates here |
| RTL | `/Applications/Freebuff-RTL.app` | `com.freebuff.desktop.rtl` | patched (Vazirmatn + `dir` logic), re-signed ad-hoc |

Both editions are installed side by side, but **run only one at a time**:
they share the same Electron profile (`~/Library/Application Support/Freebuff`,
so all settings/logins carry over) and the second launch would block on the
single-instance lock.

## ⚡ Fast rebuild after an update (one command)

```bash
bash patch/patch.sh --relaunch
```

That single command does everything: verifies the original is pristine →
deletes the old RTL copy → copies the original → renames bundle + helper apps
→ patches UI (font + `rtl.js`) → re-signs → launches the RTL edition →
verifies over HTTP (`ALL CHECKS PASSED`). Takes ~1–3 min (mostly file copy +
re-sign).

Update flow:

```bash
# 1. Update the ORIGINAL (manual install / in-app update of Freebuff.app)
# 2. Rebuild the RTL edition from it:
bash patch/patch.sh --relaunch
# 3. Use /Applications/Freebuff-RTL.app (quit the original first)
```

If the source already carries an old patch, the script still works as long as
clean `.patchbak` backups exist — it normalizes the COPY to pristine bytes
(the source itself is never touched). Without clean backups it aborts and asks
for a pristine reinstall.

Direction rule (per text block):
- **any** Persian/Arabic character → block renders **RTL** (right-aligned,
  readable right-to-left), **even if the sentence starts with English words**
  e.g. "WiGate: از نظر فنی ..."
- only Latin/English characters → block renders **LTR**
- code / terminal blocks always stay **LTR**
- **Opened files** (CodeMirror editor):
  - **documentation/text files** (Markdown, plain text, RST, AsciiDoc, LaTeX,
    …) follow the same rule → Persian lines render RTL
  - **code files ALWAYS stay LTR** — never RTL (critical requirement)
  - file type is detected from the editor's `data-language` attribute

> History: forcing RTL was temporarily replaced by `dir="auto"` (first-strong-char)
> because the forced RTL moved leading English words to the right. But the user
> confirmed that an LTR base for Persian-containing sentences is **unreadable**
> for a Persian reader, so the final rule is: **any Persian/Arabic char → RTL**.
> A stale CSS accumulation bug (7 stacked copies from a marker mismatch) also
> polluted rendering during testing — fixed by pinning the marker. The marker is
> now `FBF-RTL-PATCH-V5`, and `patch.sh` recognises any `FBF-RTL-PATCH-V*`
> prefix so an older generation is stripped instead of stacked.

- Applied version: **Freebuff Desktop 0.0.169** (`@codebuff/freebuff-desktop`, Electron + Bun orchestrator)
- Patch date: Sep 2026 (clone workflow: original + `Freebuff-RTL.app`)
- Previous patch generations: V2 for 0.0.86–0.0.128 (Inter fonts,
  textarea composer); V3 for 0.0.146–0.0.156 (Google Sans + DM Mono +
  Outfit fonts, contentEditable composer); V4 for 0.0.161 (questions +
  to-do list). Current generation: **V5** — adds the generic layer, so the
  patch no longer needs to track new UI classes. Marker
  `FBF-RTL-PATCH-V5`; `patch.sh` detects any `FBF-RTL-PATCH-V*` for
  dirty/normalize checks.
- Author/user decision: "فقط متن RTL، چیدمان LTR" + "فقط متن فارسی/عربی با Vazirmatn"

---

## 🚀 Re-patching after an update

After updating the **original** Freebuff, the RTL edition is stale (it is a
copy). Rebuild it from the updated original:

```bash
# 1. Fully quit both editions (Cmd+Q) — or just use --relaunch
# 2. Rebuild the RTL edition from the original
bash patch/patch.sh --relaunch
# 3. Launch /Applications/Freebuff-RTL.app
```

The script deletes the old RTL copy, re-copies the original, re-detects the
new hashed asset filenames, re-applies the patch, re-signs, and verifies.
The original is never modified. Custom locations:

```bash
bash patch/patch.sh --src /path/to/Freebuff.app --dst /path/to/Freebuff-RTL.app --relaunch
```

Legacy in-place patching (modifies + re-signs the target directly) is still
available but NOT recommended: `bash patch/patch.sh --in-place [--force] [--relaunch]`.

## ✅ Verifying the patch worked

The built CSS is served by the Bun orchestrator over local HTTP (port varies).
With Freebuff running:

```bash
UI=/Applications/Freebuff-RTL.app/Contents/Resources/orchestrator/ui
PORT=$(lsof -nP -iTCP -sTCP:LISTEN | awk '/bun/{print $9}' | sed 's/.*://' | head -1)
CSS=$(basename "$(ls "$UI"/assets/index-*.css | head -1)")
curl -s "http://127.0.0.1:$PORT/assets/$CSS" | grep -c Vazirmatn   # expect >= 1 (18 on 0.0.169)
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" \
  "http://127.0.0.1:$PORT/assets/vazirmatn-wght.woff2"           # expect 200 111152
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://127.0.0.1:$PORT/assets/rtl.js"                          # expect 200
```

Note: quote the CSS filename — an unquoted `assets/index-*.css` inside the URL
is **not** expanded by the shell, so `curl` asks for a literal `*` path.

Visually: type Persian in the composer — it should align right and shape with
Vazirmatn; English text remains left-aligned with **Google Sans** (Inter only in
bundles <= 0.0.128).

---

## 📚 Knowledge / how the app is built (IMPORTANT for future patches)

### Architecture
- **Freebuff.app** is an Electron app split into two parts (see
  `electron/main.cjs` header comment):
  1. **Electron shell** — `Contents/MacOS/Freebuff`, defined in `app.asar`
     (`electron/main.cjs`, `preload.cjs`, …). Creates the window and spawns…
  2. **Bun orchestrator** — `Contents/Resources/orchestrator/orchestrator.js`
     (a single ~8.7 MB Bun bundle). Spawned as a child via
     `Contents/Resources/bun/bun`. Listens on a localhost HTTP port.
- The **renderer UI is NOT bundled into the app**: the orchestrator **serves**
  `orchestrator/ui/` from disk at request time (`Bun.file`):

```js
let rel = pathname === "/" ? "index.html" : pathname.slice(1),
    root = resolve15(uiDir), ...
let index = Bun.file(join28(root, "index.html"));
```

- → **Patch the files under `Contents/Resources/orchestrator/ui/` of the RTL
  copy, NOT `app.asar`, NOT the original.** No asar repack. The RTL copy is
  re-signed ad-hoc afterward (preserving entitlements) because editing bundle
  files breaks the code signature seal — otherwise macOS reports "app is
  damaged". The original app is never touched, so its vendor signature and
  update path stay intact. `electron-updater` files inside the RTL copy keep
  their feed URL but get a separated updater cache dir (`…-rtl`);
  update the ORIGINAL, then rebuild the RTL copy.

### File locations inside the bundle
| What | Path |
|---|---|
| UI entry HTML | `Contents/Resources/orchestrator/ui/index.html` |
| Built JS  | `Contents/Resources/orchestrator/ui/assets/index-*.js` (hashed, e.g. `index-CzdfXtH9.js`) |
| Built CSS | `Contents/Resources/orchestrator/ui/assets/index-*.css` (hashed, e.g. `index-Bc1bh1ka.css`) |
| Google Sans / DM Mono / Outfit | `ui/fonts/google-sans/*.woff2`, `ui/fonts/dm-mono/*.ttf`, `ui/fonts/outfit/*.ttf` (no Arabic subset in Google Sans!) |
| Legacy Inter fonts (<=0.0.128) | `ui/assets/inter-*.woff2` (from `@fontsource-variable/inter`) |
| Our font | `ui/assets/vazirmatn-wght.woff2` |

`ui/assets/` also contains ~313 shiki syntax-highlight language/theme files —
those are noise. Do not glob them; always match `index-*.css` / `index-*.js`.

### How the patch works (design)

`patch/patch.css` is **appended** to the built CSS (cascade: later rules win, so
appending is safe with a minified file):

1. **Fonts via `unicode-range`** — we add one `@font-face` for a
   **Vazirmatn variable** woff2 (`fonts/webfonts/Vazirmatn[wght].woff2` from the
   `vazirmatn` npm package, v33.x) whose `unicode-range` covers only
   Arabic/Persian codepoints:
   `U+0600-06FF, U+0750-077F, U+0870-089F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F, U+202B, U+202E, U+25CC`.
   Then we redefine `--font-sans` to `"Google Sans", "Inter Variable", Inter,
   Vazirmatn, …` (Google Sans first — it is the 0.0.146+ live font; Inter is a
   harmless legacy fallback) and `--font-mono` to `"DM Mono", …, Vazirmatn`.
   → Latin resolves to Google Sans/DM Mono, Arabic **falls through** to
   Vazirmatn. **Font-alias trick (V3):** extra `@font-face` blocks NAMED
   `"Google Sans"`, `"DM Mono"` and `"Freebuff Outfit"` with the same Arabic
   `unicode-range` pointing at the Vazirmatn file — the bundle hard-codes
   `font-family:Google Sans` in 50+ rules that ignore `--font-sans`, and
   Google Sans ships NO Arabic subset, so without the alias Persian would
   fall back to the system font. The alias makes every such rule render
   Persian with Vazirmatn automatically.
2. **Per-block direction (`dir` from a Persian/Arabic regex)** — a small script
   **`rtl.js`** (injected into `index.html`, served from `ui/assets/`) runs a
   `MutationObserver` and sets `dir="rtl"` on any leaf text block whose text
   contains ANY Persian/Arabic character, and `dir="ltr"` on pure-English
   blocks. Covered blocks: `.prose p, li, h1–h6, blockquote, td, th`,
   `.bubble` + `.user-message-text` (user messages), `.tool-row-details`
   (tool output), `.composer textarea` + `.composer [data-composer-input]` /
   `.composer-input` (input — the composer migrated from `<textarea>` to a
   contentEditable div in 0.0.146+; the `input` event hook covers both).
   Multiple-choice questions (`.question-text`, `.question-option-label` /
   `-desc`, `.question-plan`, `.question-free` input) and the agent to-do
   list (`.todo-dock-text`) follow the same rule (V4). Only leaf text spans
   get `dir` — flex-row containers (`.question-option`, `.todo-dock-item`)
   stay LTR so checkboxes keep their position (text RTL, layout LTR).
   **V5 generic layer:** 0.0.169 ships **1318 distinct classNames** and adds
   new text surfaces every release, so `SEL` alone can never keep up.
   `scanGeneric()` walks *text nodes* and flags the element that directly
   owns Persian text — anywhere — with `dir="rtl" data-fbf-rtl="1"`. One
   CSS rule (`[data-fbf-rtl="1"]`) then covers every present and future
   Persian surface. JS enforces the exclusions, not CSS:
   `NEVER_SEL` (code, terminal, CodeMirror, diffs, svg, `sr-only`,
   `aria-hidden`) and `LAYOUT_SEL` (buttons/tabs/menu items/`label`/… so
   flex row order never flips).
   The regex is ZWNJ-aware (`U+200C–200F, U+202A–202E` included — critical
   for Persian "می‌کنم"). Streaming text (`textContent` swaps) and
   newly-added messages are handled by the observer + a periodic re-scan.
   Code blocks are excluded (`.md-code`, `.md-pre`, `.md-inline`, `pre`,
   `code`) and forced `direction: ltr; text-align: left` in CSS.
3. **Opened files (CodeMirror)** — Freebuff displays files in a CodeMirror 6
   editor (`cm-editor`). rtl.js also manages every `.cm-line`:
   - The editor's `data-language` (set by CodeMirror on `.cm-content`) decides
     the file type via the `DOCS_LANG` whitelist
     (`markdown|mdx|rst|asciidoc|textile|org|latex|tex|typst|text|plain|log|…`).
   - **Documentation/text files**: Persian lines get `dir="rtl"` (matching the
     prose rule); English lines `dir="ltr"`.
   - **Code files**: every line is forced `dir="ltr"` — code must never be RTL.
   - Vazirmatn is added to the editor font stack (`.cm-editor` family) so
     Persian glyphs render with Vazirmatn in ALL files (code + docs); direction
     is only RTL for docs files.
4. **index.html** — only gets one injected `<script src="./assets/rtl.js"
   defer></script>` tag (placed just before the app module script). `lang="en"`
   stays. The only `dir="ltr"` in the JS bundle is the **xterm terminal**, which
   we leave alone — terminals must stay LTR.

### Testing the direction rules

`patch/rtl.test.js` mounts the real `rtl.js` in a DOM (jsdom) and asserts the
resulting `dir` per surface — chat prose, questions, to-do list, code blocks,
the terminal, diffs, both CodeMirror cases, composer inputs, and the generic
layer:

```bash
node patch/rtl.test.js     # expect: 26/26 passed; exit 0
```

Expectation values use `''` to mean **the `dir` attribute must be absent**, so
"never flip" is asserted as strictly as "must flip". Run it after touching
`rtl.js` — a single misplaced `dir` on a flex row silently moves a checkbox to
the wrong side, and an over-broad generic rule silently RTL-flips a code block.
Both are invisible to `grep`/HTTP checks, which only prove the patch landed.

### Re-applying after a patch.css/rtl.js change
`patch/patch.sh` rebuilds the RTL copy fresh from the original every run, so
after editing `patch.css` or `rtl.js` just re-run it (no `--force` needed in
clone mode; `--force` only affects legacy `--in-place`):

```bash
bash patch/patch.sh --relaunch
```

### Pitfalls / rules for future patches
- Hashed filenames (`index-Bc1bh1ka.css`) change every release — locate them with
  a glob, never hard-code.
- **Renamed bundles MUST rename the Electron helpers too.** Electron resolves
  helpers strictly as
  `Frameworks/<CFBundleName> Helper*.app/Contents/MacOS/<CFBundleName> Helper*`
  (`ElectronMainDelegate::OverrideChildProcessPath` — verified against Electron
  v33 source). Rename the helper dirs AND the binaries inside AND
  `CFBundleExecutable` (+ display name / identifier for hygiene), otherwise the
  copy crashes on launch with `FATAL: Unable to find helper app`. Proven by
  elimination: dir-only rename still crashed; only after the binary rename did
  it launch. `patch.sh` does all of this + a sanity check for the exact
  executable path.
- **Use `dir="rtl"` for any block containing Persian/Arabic (regex match on the
  text), NOT `dir="auto"`.** `dir="auto"` (first-strong-char) leaves English-leading
  sentences LTR, which is unreadable for Persian readers. `dir="rtl"` makes the
  whole block right-to-left even when it starts with English words.
- **Opened files: code must NEVER be RTL.** The editor's `.cm-line` direction is
  gated behind the `DOCS_LANG` whitelist (the `data-language` attribute CodeMirror
  sets on `.cm-content`). If a docs file type isn't picked up, add its language
  name to `DOCS_LANG` in `rtl.js`. Do NOT extend RTL to unknown/empty languages —
  an unclassified file should default to LTR to protect code.
- Do NOT forget the `[dir="rtl"] { text-align: right }` CSS rule — `dir` alone
  doesn't right-align if an ancestor sets `text-align:left`.
- **Never put `dir` on a flex/grid row.** `dir` reorders flex children, so
  setting it on `.question-option` / `.todo-dock-item` moves the checkbox to
  the wrong side. Always flag the leaf that *owns the text*
  (`LAYOUT_SEL` in `rtl.js` blocks this); the generic layer exists for
  exactly this reason.
- The `FBF-RTL-PATCH-V5` marker in `patch.css` MUST match `CSS_MARKER` in
  `patch.sh` exactly (ASCII). A past em-dash/ASCII mismatch silently broke
  `--force` and stacked 7 copies of the CSS patch. Dirty/normalize detection
  uses the `FBF-RTL-PATCH-V` prefix so older V2 patches are still recognized.
- The app **must be restarted** (or the renderer reloaded) to pick up new
  assets: quit the RTL edition with Cmd+Q, re-run the script, then
  `open /Applications/Freebuff-RTL.app`.
- The RTL copy is re-signed ad-hoc (entitlements preserved) and its quarantine
  is cleared — never skip the re-sign step, or macOS reports "app is damaged"
  (editing bundle files breaks the sealed-resource check). The ORIGINAL must
  never be patched in place; always rebuild the copy. Notes from debugging:
  - Extract entitlements with `codesign -d --xml --entitlements <file>` — plain
    `-` output and non-`--xml` file output are human-readable display format,
    NOT a valid plist (the old `path:` form is deprecated and fails).
  - `spctl --assess` says "rejected" for ad-hoc signatures — harmless as long
    as quarantine is cleared (assessment is only enforced on quarantined files).
- If the orchestrator serving changes (e.g. UI becomes embedded in a single JS),
  the patch location moves — search `main.cjs` for `uiDir` / `index.html`.
- If the Vazirmatn npm payload changes, the woff2 is at
  `fonts/webfonts/Vazirmatn[wght].woff2` (jsdelivr npm path). Only `unicode-range`
  + font-family lines are order-sensitive: Vazirmatn must come **after** Inter in
  the stack.
- Do **NOT** patch the original in place and do NOT re-sign / xattr the
  original — only the RTL copy's UI dir is edited and only the copy is
  re-signed; the original's `app.asar`, `MacOS/` and vendor signature stay
  untouched.

## 🔄 Reverting
The pristine CSS/HTML are saved next to the patched files inside the RTL copy
(`.patchbak`). To drop the RTL edition entirely, just delete it — the original
was never modified:

```bash
rm -rf /Applications/Freebuff-RTL.app
```

(Or rebuild it after an original update: `bash patch/patch.sh --relaunch`.)

## 📁 Files in this repo
| Path | Purpose |
|---|---|
| `patch/patch.sh` | Builds `/Applications/Freebuff-RTL.app` from the pristine original (`--relaunch` launches + verifies); `--in-place` is legacy |
| `patch/patch.css` | The CSS injected into the app's bundled stylesheet |
| `patch/rtl.js` | Per-block `dir` script (any Persian/Arabic → rtl) for chat + editor; code files forced LTR |
| `patch/rtl.test.js` | jsdom regression tests for the direction rules (`node patch/rtl.test.js`) |
| `patch/assets/vazirmatn-wght.woff2` | The Vazirmatn variable font (111 KB) |
| `README.md` | This knowledge file |

## Extras
- Font download source:
  `https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/fonts/webfonts/Vazirmatn%5Bwght%5D.woff2`
- `app.asar` was extracted once for inspection (`npx @electron/asar extract`)
  — no code in the asar needs patching, only the `ui/` files above.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

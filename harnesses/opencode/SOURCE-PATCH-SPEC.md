# SOURCE-PATCH-SPEC — RTL/Persian Custom Build (source rebuild path)

> Provenance: extracted verbatim from `opencode/AGENTS.md`, section
> `## RTL/Persian Custom Build` (nested source repo, branch `rtl-v1.18.25`,
> commit `b5731da`), on 2026-10-11. Only this header was added.
> Refreshed 2026-10-17: v2-feed upgrade flow + RTL-2 (`--rtl2-app`); kept in
> sync with `opencode/AGENTS.md`.
>
> When to use this file: ONLY for a full **source rebuild** of the opencode
> desktop app. For the normal path (patching an installed official app),
> ignore this file and follow `README.md` + `RTL-PATCH.md` instead.
>
> ⚠️ GAP NOTE (2026-10-11): the archive patcher (`rtl-patch-official.mjs`)
> contains THREE additions that have NO equivalent in the 8 source patches
> below yet — (1) multi-choice question-dock direction (`DOCK_TEXT_RTL` /
> `applyDockTextDirections`), (2) model todo-list direction (same pass,
> extended selectors), (3) Pierre shadow-DOM direct-dir pass for document
> files (`observePierreDocViewers` / `applyPierreDocLines`). A future source
> rebuild MUST port these three to the corresponding source files
> (`session-question-dock.tsx`, `session-todo-dock.tsx` + `message-part.tsx`
> question/todos parts, `file.tsx`) or the rebuilt app will regress on
> questions, todos, and sidebar document files.

## RTL/Persian Custom Build

### Upgrade Protocol (AUTOMATIC — do not ask)
When the user says "به نسخه X.Y.Z بروزرسانی کن" / "upgrade to vX.Y.Z" (or asks for the newest
version without a number), perform the FULL flow autonomously WITHOUT asking again.

Preferred path — installed official app (no source rebuild):
`node apply-rtl-patch.mjs --update --rtl-app /Applications/OpenCode-RTL.app --rtl2-app /Applications/OpenCode-RTL-2.app`
for newest upstream, or the same with `--version X.Y.Z` when pinned. This keeps `OpenCode.app`
official and builds the patched daily driver at `OpenCode-RTL.app` plus the fully independent
`OpenCode-RTL-2.app` (own bundle id/userData/XDG homes, badge icon, daemon port 49375). The
wrapper resolves 2.x releases from the v2 desktop feed on opencode.ai (the v1 GitHub feed only
for 1.x installs), downloads `opencode-desktop-mac-arm64.zip` ONLY when the installed app is
older (or pinned differently), sha512-verifies when the feed provides a hash, verifies the
official Developer-ID signature (never ad-hoc), installs it, keeps a non-overwriting
`OpenCode-original-vX.Y.Z.app` backup (created automatically from the installed official app
when missing), applies ALL patches below (incl. 16px font, Vazirmatn, docs-only RTL with
content check), updates `ElectronAsarIntegrity`, ad-hoc signs, verifies, and reports. Quit
OpenCode before upgrading; relaunch manually after.

Source-build path (only for source changes or custom builds):
stash → fetch tag → checkout tag → apply ALL 8 patches below EXACTLY as specified
(incl. 16px font, Vazirmatn, docs-only RTL with content check) → restore the RTL section of THIS
file into the fresh checkout's AGENTS.md (append from the previous stash if needed) → `bun install`
→ create `/tmp/models-api.json` → build → package → verify Info.plist version → report.
Do not drop any patch. Do not patch any other file.

### Core RTL Rules
1. ANY Persian/RTL character anywhere ⇒ RTL for the whole sentence/paragraph/input — even when it
   starts with English words, digits or symbols. Detection is done in JAVASCRIPT (regex over the
   full text), NOT via CSS `unicode-bidi: plaintext` (plaintext always resolves by FIRST strong
   character and also overrides the `dir` attribute — never use it on these blocks).
2. Code files and ALL diffs are ALWAYS LTR. Never apply RTL to code. Markdown code blocks
   (pre/code/.shiki) stay LTR even inside RTL paragraphs.
3. Only documentation extensions get file-viewer RTL (see DOCUMENT_EXTENSIONS).
4. Prompt-input font is forced to **16px** (stock is 13px).
5. Global UI font is **Vazirmatn** (first in `--font-family-sans`; also first in `--diffs-font-family`).

### Build Parameters (fixed)
- **Name:** OpenCode (no branding changes)
- **App ID:** `ai.opencode.desktop` (original)
- **Channel:** `OPENCODE_CHANNEL=prod` (no DEV badge)
- **Patches:** ONLY RTL/Persian support + font size bump — no other changes
- **Output:** `packages/desktop/dist/mac-arm64/OpenCode.app` (no DMG/ZIP)

### RTL Patches (8 files)

#### 1. `packages/session-ui/src/v2/components/prompt-input/index.tsx` (the REAL typing input)
The desktop app renders the **V2 composer**, NOT `packages/app/src/components/prompt-input.tsx`
(that legacy file is only the fallback when `settings.general.newLayoutDesigns()` is false — leave it
untouched). The editor `contenteditable` is here (`text-[13px]` by default).

IMPORTANT: `dir="auto"` + `unicode-bidi: plaintext` on a `contenteditable` is unreliable in
Chromium, AND first-strong detection breaks sentences that start with English but contain Persian.
The fix sets `editor.dir` explicitly on every input/render using the rule below: ANY Persian/RTL
character anywhere in the text forces RTL for the whole input.

a) Add module-level helpers (before `export type PromptInputV2Mode`, escape ranges with `\uXXXX`):
```ts
const PROMPT_INPUT_RTL = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const PROMPT_INPUT_LTR = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/
// Any Persian/RTL character ANYWHERE makes the whole input RTL,
// even when the text starts with English words.
function detectPromptInputV2Direction(text: string): "rtl" | "ltr" | null {
  if (PROMPT_INPUT_RTL.test(text)) return "rtl"
  if (PROMPT_INPUT_LTR.test(text)) return "ltr"
  return null
}
function applyPromptInputV2Direction(editor: HTMLDivElement) {
  const text = (editor.textContent ?? "").replace(/\u200B/g, "")
  editor.dir = detectPromptInputV2Direction(text) ?? "auto"
}
```

b) Call it in BOTH places:
- end of `renderPromptInputV2Editor` (right after `editor.replaceChildren(...)`, before `if (!active) return`)
- in the editor's `onInput` handler: `applyPromptInputV2Direction(event.currentTarget)` after `props.controller.onInput(...)`

c) Editor element: add `dir="auto"` + `style={{ "text-align": "start" }}`, use `font-sans`, and bump font 13px→16px:
```diff
  autocomplete="off"
+ dir="auto"
+ style={{ "text-align": "start" }}
- class="... text-[13px] font-[440] ..."
+ class="... font-sans text-[16px] font-[440] ..."
```
Also bump the placeholder ghost text (the `<Show when={!props.controller.value()}>` div) from
`text-[13px]` to `text-[16px]` and add `font-sans`. Do NOT change the popover search input's `text-[13px]`.

NOTE (archive patcher only): `rtl-patch-official.mjs` additionally writes an inline `font-size:16px`
style on both templates plus an unlayered
`form[data-component="prompt-input-v2"] [data-component="prompt-input"]{font-family:var(--font-sans);font-size:16px}`
CSS rule, because post-build Tailwind cannot generate a new `text-[16px]` utility (verified: the
bundle only ships 11/12/13/15/21px text utilities). Source builds do not need this — Tailwind
generates the rule at build time.

FONT SIZE REQUIREMENT: the prompt input font must be **16px** (the current user-selected size; stock is
13px). When applying the RTL patch to a NEW version, always look for the latest default size (may change
across versions) and bump it to 16px, then keep the
documented size in sync here.

#### 2. `packages/session-ui/src/components/markdown.tsx` — AI output direction (JS-based)
CSS `unicode-bidi: plaintext` resolves by FIRST strong character, so paragraphs starting with
English/digits stay LTR. The fix is a JS pass that sets an explicit `dir` attribute on every block:
ANY Persian char in the block's text ⇒ `dir="rtl"`, else `"ltr"`.

a) Add module-level helper (before `function pendingBlocks(`):
```ts
const MARKDOWN_RTL = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
const MARKDOWN_DIRECTION_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, td, th, figcaption"

// Any Persian/RTL character ANYWHERE in a paragraph/block forces RTL for that
// whole block — even when the sentence starts with English words, digits or
// symbols. Code blocks (pre/code) are excluded and always stay LTR.
function applyMarkdownDirections(root: HTMLElement) {
  const blocks = root.querySelectorAll<HTMLElement>(MARKDOWN_DIRECTION_SELECTOR)
  blocks.forEach((block) => {
    const next = MARKDOWN_RTL.test(block.textContent ?? "") ? "rtl" : "ltr"
    if (block.getAttribute("dir") !== next) block.setAttribute("dir", next)
  })
}
```

b) Call it inside the main render effect right after the updateBlock loop:
```diff
     content.forEach((block, index) => updateBlock(container, index, block, labels))
+    applyMarkdownDirections(container)
```
(The container keeps its JSX `dir="auto"` — upstream already ships it; verify and skip if present.)

#### 3. `packages/session-ui/src/components/markdown.css`
NOTE: block direction is now controlled by the JS pass (section 2) via explicit `dir` attributes.
DO NOT add `unicode-bidi: plaintext` anywhere on text blocks — it overrides the `dir` attribute
with first-strong resolution and breaks mixed English+Persian paragraphs. Check what upstream
already ships (`grep -n "padding-inline-start\|text-align: start\|direction: ltr\|border-inline-start"`).
Stock already has: ul/ol `padding-inline-start: 32px`, ol `2.25rem`, nested `1rem`/`1.75rem`,
blockquote `border-inline-start`, th/td `text-align: start`, code `direction: ltr; unicode-bidi: isolate`.
Only add:
- Root/headings (h1-h6)/paragraphs (p)/list items (li)/blockquotes: `text-align: start;` ONLY
- If upstream ships `[data-component="markdown"] > * { unicode-bidi: plaintext; }`, change it to
  `unicode-bidi: normal;` so it cannot override the JS-set dir attributes
- `.shiki` and `pre`: `direction: ltr; unicode-bidi: normal; text-align: left;`

#### 4. `packages/session-ui/src/components/message-part.css` + `message-part.tsx` — user message bubble

a) CSS `[data-slot="user-message-text"]`: keep ONLY `text-align: start;`. Remove any
`unicode-bidi: plaintext` / `direction: auto` (upstream ships `unicode-bidi: plaintext;` — delete it;
it overrides the dir attribute set by the TSX below).

b) TSX: add module-level regex after imports:
```ts
// Any Persian/RTL character ANYWHERE makes the message text RTL,
// even when a sentence starts with English words, digits or symbols.
const MESSAGE_RTL = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
```
Then make the bubble direction reactive on its text:
```diff
  <div data-slot="user-message-text"
-   dir="auto"
+   dir={MESSAGE_RTL.test(text()) ? "rtl" : "ltr"}
```

#### 5. `packages/ui/src/styles/theme.css` — Vazirmatn global font
Add `"Vazirmatn"` as the FIRST font in the sans stack so all UI text (and file headers)
uses the installed system font (user has `~/Library/Fonts/Vazirmatn[wght].ttf`):
```diff
- --font-family-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
+ --font-family-sans: "Vazirmatn", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```
NOTE: Vazirmatn must be installed on the machine. It is a proportional font; code blocks keep
mono via the separate `--font-family-mono` / `--diffs-font-family` stack.

#### 6. `packages/session-ui/src/pierre/index.ts` — file viewer RTL + font (displayed files)
Files opened/displayed in the session render through the `File` component (`file.tsx` →
`ViewerShell`) which mounts a `diffs-container` shadow root (Pierre library). Two changes:

a) `styleVariables` — make displayed file content use Vazirmatn first (falls back to mono):
```diff
- "--diffs-font-family": "var(--font-family-mono)",
+ "--diffs-font-family": '"Vazirmatn", var(--font-family-mono)',
```

b) `unsafeCSS` (the shadow-root stylesheet) — right after the `[data-diff], [data-file]` var block,
add line-direction rules driven by CSS custom properties. They default to LTR (`ltr`/`normal`/`left`)
so code stays LTR; `file.tsx` flips them to RTL ONLY for documentation files whose CONTENT
contains any Persian/RTL character (even lines starting with English become RTL):
```css
[data-diff] [data-line],
[data-file] [data-line] {
  direction: var(--opencode-line-dir, ltr);
  unicode-bidi: var(--opencode-line-bidi, normal);
  text-align: var(--opencode-line-align, left);
}

[data-diff] [data-column-number],
[data-file] [data-column-number] {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: right;
}
```

#### 7. `packages/session-ui/src/components/file.tsx` — file viewer direction (docs only)
CRITICAL: only documentation files may be RTL, and ONLY when their content actually contains
Persian/RTL characters. Code files (and all diffs) MUST stay LTR. RTL rule: ANY Persian
character anywhere in the content makes the doc RTL — even lines/sentences that start with
English words.

a) Add a document-extension helper + RTL-content regex near the top (after `const VIRTUALIZE_BYTES`):
```ts
const DOCUMENT_EXTENSIONS = new Set([
  "md", "markdown", "mdown", "mkd", "txt", "text", "rst",
  "adoc", "asciidoc", "textile", "mdy", "mdx",
])
function isDocumentFile(name: string | undefined) {
  if (!name) return false
  const idx = name.lastIndexOf(".")
  if (idx === -1) return false
  return DOCUMENT_EXTENSIONS.has(name.slice(idx + 1).toLowerCase())
}
// Any Persian/RTL character ANYWHERE makes a document file render RTL,
// even for lines that start with English words.
const RTL_TEXT = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
```

b) `ViewerShell` — add `document?: boolean` and `rtlContents?: boolean` props. The wrapper stays
`dir="ltr"` ALWAYS (preserves code-viewer layout/gutters); RTL is applied per-line via CSS vars
that cascade into the shadow root:
```tsx
function ViewerShell(props: {
  mode: "text" | "diff"
  document?: boolean
  rtlContents?: boolean
  viewer: ReturnType<typeof useFileViewer>
  class: string | undefined
  classList: ComponentProps<"div">["classList"] | undefined
}) {
  const doc = props.document === true && props.mode === "text"
  const rtlDoc = doc && props.rtlContents === true
  return (
    <div
      data-component="file"
      data-mode={props.mode}
      data-document={doc ? "true" : undefined}
      data-rtl={rtlDoc ? "true" : undefined}
      dir="ltr"
      style={{
        ...styleVariables,
        "--opencode-line-dir": rtlDoc ? "rtl" : "ltr",
        "--opencode-line-bidi": "normal",
        "--opencode-line-align": rtlDoc ? "start" : "left",
      }}
```

c) `TextViewer` (mode="text") passes both flags — `document={isDocumentFile(local.file.name)}`
and `rtlContents={RTL_TEXT.test(text())}` (uses the existing `text()` contents memo).
`DiffViewer` (mode="diff") leaves both unset (always LTR).

### Official App Archive Flow
For patching an already-installed official macOS app, run the wrapper from the outer workspace root
(the directory containing `apply-rtl-patch.mjs`) instead of manually extracting and replacing
`app.asar`:

```sh
node apply-rtl-patch.mjs --update --rtl-app /Applications/OpenCode-RTL.app
```

The wrapper resolves the newest upstream release (skipping the download when current), keeps
`OpenCode.app` as the untouched official app, and builds the patched copy at `--rtl-app` from
the shared versioned backup (omit `--rtl-app` to patch `--app` in place),
reads the app version and bundle identifier, creates a non-overwriting
`OpenCode-original-vX.Y.Z.app` backup beside the installed app, extracts that untouched backup,
invokes `rtl-patch-official.mjs`, repacks the archive, updates the `ElectronAsarIntegrity` hash in
`Info.plist`, ad-hoc signs a staged app, verifies it, and swaps it into `/Applications` only after
all checks pass. Re-running it is safe because it always patches the same-version untouched backup.
Use `--app /path/to/OpenCode.app` for another app location or `--keep-temp` to retain staging files.
Quit OpenCode before applying the patch, then relaunch it manually afterward.

The low-level script remains available for an already-unpacked archive:

```sh
node rtl-patch-official.mjs <unpacked-app-asar>
```

### Source Build Steps
1. `git stash` the previous version's 8 patched files
2. `git fetch origin tag vX.Y.Z` — get the desired release tag
3. `git checkout vX.Y.Z`
4. Apply RTL patches to the 8 files above (incl. 16px font; skip what upstream already ships)
5. Restore the `## RTL/Persian Custom Build` section into the fresh AGENTS.md
   (append from the previous stash: `git show 'stash@{0}:AGENTS.md' | sed -n '<RTL line>,$p' >> AGENTS.md`)
6. Verify: `git status --short` must list EXACTLY the 8 patched files + AGENTS.md — nothing else
7. `bun install` (from workspace root; deps may change between versions)
8. `echo '{}' > /tmp/models-api.json` (prebuild reads this file)
9. `MODELS_DEV_API_JSON=/tmp/models-api.json OPENCODE_CHANNEL=prod bun run build` (from `packages/desktop`)
10. `MODELS_DEV_API_JSON=/tmp/models-api.json OPENCODE_CHANNEL=prod bun run package:mac -- --dir` (produces .app only)
11. App at `packages/desktop/dist/mac-arm64/OpenCode.app`; verify Info.plist shows the new version
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

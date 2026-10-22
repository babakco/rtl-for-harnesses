# OpenCode RTL Patch

This repository contains two supported RTL patch workflows:

- `apply-rtl-patch.mjs` patches an installed official macOS app.
- `rtl-patch-official.mjs` patches an already-unpacked `app.asar` directory.

The current profile uses `Vazirmatn` as the first proportional UI font and a `16px` V2 prompt
editor. Shell/code/diff content remains LTR and uses the existing monospace stack.

Supports both v1 (single `main-*.js` bundle, e.g. 1.18.x) and v2 (code-split
renderer, e.g. 2.0.32 — verified): the patcher auto-detects v2 via
`__vite__mapDeps` and injects a chunk-agnostic `V2_RTL_RUNTIME` observer into
`main-*.js`, bumps the `composer-editor` template (v2 renamed `prompt-input` →
`composer-editor` / `prompt-input-v2` → `composer`) to 16px + `font-sans` +
`dir=auto`, and patches Pierre's font var in the file chunk. v2 has no
`session-todo-dock` (todo coverage = timeline `todos` only) and already ships
`dir=auto` on markdown/user-message/question nodes — the runtime upgrades those
to any-Persian-char → RTL per the invariants below. File-viewer RTL in v2 is
line-level inside `diffs-container` shadow roots (diff hunks skipped), not
extension-gated.

> v2 note (updated 2026-10-17): `--update`/`--version`/`--check` now resolve
> the v2 desktop feed
> (`https://opencode.ai/update/api/latest/desktop/opencode/latest-mac.yml`,
> sha512-verified when the feed provides it); the v1 GitHub feed is used only
> for 1.x installs. A missing untouched backup is created automatically from
> the installed official app (Developer-ID signature required), so the daily
> upgrade flow is a single command:
> `node apply-rtl-patch.mjs --update --rtl-app /Applications/OpenCode-RTL.app --rtl2-app /Applications/OpenCode-RTL-2.app`

The installed-app workflow requires macOS, Node.js `22.12+`, and an available `npx` cache or
network connection for `@electron/asar`.

## Installed App

Quit the target apps first, then run from this repository root (rebuilds both
patched copies and keeps the official app untouched):

```sh
node apply-rtl-patch.mjs --update --rtl-app /Applications/OpenCode-RTL.app --rtl2-app /Applications/OpenCode-RTL-2.app
```

This keeps `/Applications/OpenCode.app` as the untouched official app and builds the daily
driver at `/Applications/OpenCode-RTL.app` from the shared versioned backup
(`OpenCode-original-vX.Y.Z.app`). Both copies share bundle metadata by design (same profile
and data); Finder tells them apart by file name. After building, drag `OpenCode-RTL.app` to
the Dock for daily use. Omit `--rtl-app` to patch `--app` in place instead.

### RTL-2 (Independent Second Install)

`--rtl2-app` builds a second copy that is fully independent from both the official app
and the RTL daily driver:

```sh
node apply-rtl-patch.mjs --rtl2-app /Applications/OpenCode-RTL-2.app
```

`--rtl-app` and `--rtl2-app` can be combined to build both copies in one run. The RTL-2
build applies the same RTL patch stack plus an isolation layer (marker
`RTL2_ISOLATION v1`, verified by the wrapper):

- own bundle id `ai.opencode.desktop.rtl2`, window/menu name `OpenCode-RTL-2`, helper
  bundles renamed to `OpenCode-RTL-2 Helper*.app`, and own Electron profile at
  `~/Library/Application Support/ai.opencode.desktop.rtl2`;
- its background service (`opencode-cli serve --service`, staged under that profile)
  runs with pinned XDG homes inside it — `data/opencode` (sessions DB `opencode.db`,
  logs, snapshots, repos), `config/opencode` (opencode + service config),
  `cache/opencode`, and the profile root as state home (service registration
  `opencode/service.json`). The environment is pinned at process start, before the
  service probe, so RTL-2 never attaches to or reads another install's
  service/config/data;
- its daemon listens on port `49375` instead of the built-in `49374`, so RTL-2 and the
  official/RTL service run side by side. Each app reconnects to its own daemon on the
  next launch; the daemon keeps running after the app quits, like the official one;
- accounts, providers, and sessions live in the RTL-2 database only; RTL-2 starts with
  a clean config and needs its own `/connect`;
- its app icon is regenerated from the app's own `icon.icns` on every build by
  `rtl2-icon.py`, which overlays a small amber «۲» badge in the bottom-right corner
  (needs `python3` with Pillow — `pip3 install pillow`).

The wrapper:

1. Reads `CFBundleShortVersionString` and `CFBundleIdentifier` from `Info.plist`.
2. Creates `OpenCode-original-vX.Y.Z.app` beside the installed app if it does not exist
   (from the installed official app; Developer-ID signature required).
3. Refuses to create a backup from an app that already contains the RTL markers.
4. Extracts the untouched same-version backup and applies the renderer JS/CSS patch.
5. Re-packs `app.asar` and calculates its ASAR header integrity hash.
6. Updates the matching `ElectronAsarIntegrity` entry in the staged `Info.plist`.
7. Ad-hoc signs and verifies the staged app before replacing the installed app.
8. Verifies the installed archive, plist, bundle identity, version, and code signature.

The operation is repeatable: every run starts from the untouched same-version backup, so it does
not accumulate duplicate string replacements. Use an alternate location with:

```sh
node apply-rtl-patch.mjs --app /path/to/OpenCode.app
```

Use `--keep-temp` when diagnosing an archive patch failure. The low-level command is only for an
already-unpacked archive:

```sh
node rtl-patch-official.mjs /path/to/unpacked-app-asar
```

After a successful patch, relaunch OpenCode manually. The app is ad-hoc signed because the
archive changed; `spctl` may reject that signature even when `codesign --verify --deep --strict`
passes.

### Newest Version

`--update` makes every patch land on the newest official release. For 2.x it resolves the
release from the v2 desktop feed (`https://opencode.ai/update/api/latest/desktop/opencode/`)
and downloads `opencode-desktop-mac-arm64.zip` ONLY when the installed app is older; the
download is sha512-verified when the feed provides a hash and always Developer-ID signature
verified (never ad-hoc) before install. The v1 GitHub feed is used only when the installed app
is 1.x (set `GH_TOKEN`/`GITHUB_TOKEN` there for a higher API rate limit). When the installed app
is already current, `--update` simply re-applies the patch logic. `--version X.Y.Z` pins a
release instead (downgrades allowed; pinned 2.x downloads come from
`https://opencode.ai/files/bin/X.Y.Z/`); `--check` prints installed vs newest official without
changing anything. Without these flags the wrapper patches the installed app as-is
(offline-friendly).

A missing untouched `OpenCode-original-vX.Y.Z.app` backup is created automatically from the
installed official app — including right after an in-app update of the official app — while
refusing bundles that already contain RTL markers and requiring the Developer-ID signature.

Prefer this wrapper over the app's built-in auto-update: a self-update would replace the
patched archive, so just re-run the wrapper afterward. Pair `--update` with
`--rtl-app /Applications/OpenCode-RTL.app --rtl2-app /Applications/OpenCode-RTL-2.app`
to keep both patched copies on every upgrade.

## OpenCode Plugin

`oh-my-openagent@latest` is enabled in `~/.config/opencode/opencode.json`. Its local cache is
verified at `~/.cache/opencode/packages/oh-my-openagent@latest` with package version `4.19.4`.
After changing plugin configuration or repairing its cache, relaunch OpenCode manually so the
running process loads the plugin.

## RTL Invariants

- Any Persian/Arabic-script character anywhere in a sentence, paragraph, message, prompt, question, option, todo, or document file forces the whole block RTL.
- Direction is set in JavaScript; do not use `unicode-bidi: plaintext` for these blocks.
- Code files, code blocks, diffs, line numbers, and shell content remain LTR.
- File-viewer RTL (sidebar file tabs, e.g. `.md` guides) applies only to documentation extensions and only when the file content contains RTL characters. Two layers: (1) `ViewerShell` sets `data-rtl="true"` + `--opencode-line-dir: rtl` CSS vars consumed by the Pierre shadow-DOM stylesheet (`[data-file] [data-line]`); (2) a `MutationObserver`-driven JS pass (`observePierreDocViewers`, `applyPierreDocLines`) sets `dir="rtl"` + `text-align: start` directly on every `[data-line]` inside each `diffs-container` shadow root, re-applied when Pierre re-renders lines (scroll/virtualization). Only `data-mode="text"` viewers flagged `data-rtl="true"` are touched. Source: `TextViewer`/`ViewerShell` in `packages/session-ui/src/components/file.tsx` (archive-patcher only for now — a future source rebuild must add the equivalent source patches there).
- Dock text direction (multi-choice question dock `session-question-dock` + answered `question-answers`, and the model-created todo list in the timeline `todos` + `session-todo-dock`): container layouts stay LTR; only the question text, option buttons (label + description flip together), custom-answer textarea, answered question/answer text, todo item text, and todo preview/list flip to RTL via a `MutationObserver`-driven JS pass (`DOCK_TEXT_RTL`, `applyDockTextDirections`), with `text-align: start` CSS on those slots. Sources: `packages/app/src/pages/session/composer/session-question-dock.tsx`, `packages/app/src/pages/session/composer/session-todo-dock.tsx`, and the `question`/`todos` tool parts in `packages/session-ui/src/components/message-part.tsx` (archive-patcher only for now — a future source rebuild must add the equivalent source patches there).
- The V2 prompt editor and placeholder use `16px` and `font-sans`; the popover search input remains `13px`. The archive patch pins the size with an inline `font-size:16px` style plus an unlayered `form[data-component="prompt-input-v2"] [data-component="prompt-input"]` CSS rule, because post-build Tailwind cannot generate a new `text-[16px]` utility (the bundle only ships 11/12/13/15/21px text utilities). Shell mode keeps its `font-mono!` monospace (it is `!important`).
- `Vazirmatn` is first in the global sans, V2 text, V2 sans, and Pierre diff-font stacks.
- Production UI changes stay limited to the eight documented RTL source files plus the dock-text (question + todo) and Pierre document-viewer archive patches; patch automation and its documentation are kept outside the source tree.

## Source Build

For a new source release, follow the `RTL/Persian Custom Build` section in `opencode/AGENTS.md`.
That workflow checks out the release tag, reapplies the eight source-file patches, restores the
RTL documentation section, builds with `OPENCODE_CHANNEL=prod`, packages the `.app`, and verifies
the resulting `Info.plist` version. Use the installed-app wrapper above when a source rebuild is
not required.

## Verified Installation

The split layout verified by this workflow is:

```text
/Applications/OpenCode.app                  # official original (untouched, Developer-ID signed)
/Applications/OpenCode-RTL.app              # patched daily driver (ad-hoc signed)
/Applications/OpenCode-RTL-2.app            # independent second install (ad-hoc signed, isolated data)
/Applications/OpenCode-original-vX.Y.Z.app  # pristine per-version backup (patch source)
```

Verified 2026-10-12 on v2.0.27 (rev 2, after no-effect fix): official + RTL +
`OpenCode-original-v2.0.27.app` all `2.0.27`, `codesign --verify --deep
--strict` passes on the RTL app, `ElectronAsarIntegrity` hash `8988ece9…419`
matches the repacked asar, 35/35 patch checks green, marker sweep
(`V2_RTL_RUNTIME v6`, `characterData:true` on both observers,
`attributes:true,attributeFilter:["dir"]` observer option, the runtime
inline-plaintext neutralizer (`unicodeBidi==="plaintext"` → `normal`), the
unlayered `[data-component=composer-editor],[data-component=prompt-input]{unicode-bidi:normal!important}`
pin, `DOMContentLoaded` bootstrap retry,
`closest([data-component=composer-editor])` input trigger,
`PROMPT_INPUT_RTL` composer 16px, `MARKDOWN_RTL`, `MESSAGE_RTL`, `DOCK_TEXT_RTL`,
`observePierreDocViewers`, the dock textarea
`textarea[data-slot="question-custom-input"]{unicode-bidi:normal!important}`
pin, the dock option `[dir=auto]` child alignment, the Pierre inline
`line.style.direction="rtl"` hardening, three Vazirmatn CSS prepends, and the minified
settings sans fallback `"Vazirmatn", "Inter", ui-sans-serif, …` that defeats
the inline `--font-family-sans` written by the v2 Settings effect) present,
no `unicode-bidi:plaintext` left in the patched CSS on the markdown root /
user-message blocks, and the composer's inline `plaintext` is defeated by the
neutralizer + !important pin.

### RTL-2 isolation verified (2026-10-17)
RTL-2 verified on v2.0.27 and v2.0.32: own daemon `opencode-cli serve --service
--port 49375` staged and registered under `ai.opencode.desktop.rtl2`
(`opencode/service.json`, `data/opencode/opencode.db`, `config/opencode`),
`probed: false` in the desktop log (no attachment to the shared service), badge
icon applied, runs concurrently with the official app + daemon on `49374`;
`~/.config/opencode`, `~/.local/share/opencode`, `~/.local/state/opencode`
(service.json untouched), and the official app were unchanged through
launch/quit tests. The 2.0.32 rebuilds are byte-stable across rehearsal and
real runs (RTL-2 asar integrity `097f7100…4da0`, RTL `b6208cf4…0161`).

### v2 composer bidi fix (2026-10-12)
The v2 composer editor receives inline `unicode-bidi: plaintext` from the app in normal mode; `plaintext` resolves direction by the first strong character per paragraph and overrides the `dir` attribute, so English-first mixed text stayed LTR. Two independent layers now defeat it: (1) the runtime's `v2ApplyDir` rewrites an inline `plaintext` value to `normal` whenever it sets a direction, and (2) an unlayered author `!important` rule pins `unicode-bidi: normal` on `[data-component=composer-editor]` (and future `[data-component=prompt-input]`). The runtime also observes `dir` attribute rewrites (`attributes:true, attributeFilter:["dir"]`) so reactive app re-renders are re-corrected, and the composer selector covers both editor variants. Live visual check (English-first mixed Persian in the composer, caret stability) remains manual per the note above.

### v2 dock + sidebar viewer pass (2026-10-13)
Question dock: the custom-answer textarea carries the same inline `unicode-bidi:plaintext` trap as the composer; it is defeated by the JS neutralizer plus an unlayered `unicode-bidi:normal!important` pin; option rows now propagate their direction decision to any `[dir=auto]` descendants (e.g. `option-description`) so label and description flip together. File viewer: Pierre shadow CSS contains no direction overrides on lines, so the runtime's per-line `dir=rtl` is effective; v6 additionally sets inline `direction:rtl` and `unicode-bidi:normal` on flipped lines as belt-and-braces. Diffs stay LTR (lines inside `[data-diff]` are skipped) and column numbers are untouched. Known limitation: the viewer exposes no file-name/extension in the DOM, so there is no docs-only gate — any line containing an RTL character flips in any file viewer, including code files with Persian comments.

Known v2 behaviors from the no-effect investigation: (1) stock first-strong
`dir=auto` flips only Persian-start text — the runtime upgrades it to
any-Persian-char per the invariant; (2) the app's Settings → Appearance UI
font stores a custom family that is written inline on `<html>`; with the
minified-fallback patch the default stays Vazirmatn-first, and a user-chosen
family still wins (it is prepended before Vazirmatn); (3) never launch a
Finder duplicate such as `/Applications/OpenCode copy.app` — only
`/Applications/OpenCode-RTL.app` carries the patch. Visual RTL checks (Persian
+ mixed text in composer, markdown, user bubbles, questions, todos, sidebar
docs) remain for the user inside `OpenCode-RTL.app` before adopting it as the
daily driver.

`OpenCode.app` and `OpenCode-RTL.app` share bundle ID `ai.opencode.desktop` by design
(same profile and data); `OpenCode-RTL-2.app` uses `ai.opencode.desktop.rtl2` with fully
isolated data, config, and service. Confirm the live versions any time with
`node apply-rtl-patch.mjs --check`.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

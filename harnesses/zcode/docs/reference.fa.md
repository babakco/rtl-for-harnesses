# zcode-rtl-patch

Builds **`ZCode-RTL.app`** — a Persian-friendly (RTL + *Vazirmatn*) copy of the
installed **`ZCode.app`** (`dev.zcode.app`, Electron) — without ever touching the
original.

The copy is always rebuilt from the pristine original, so **updating the original
and re-running one command is the whole workflow.**

```bash
npm run patch          # build + install /Applications/ZCode-RTL.app
npm run patch:dry      # show exactly what would change; writes nothing
npm run inspect        # dump the source archive's RTL-relevant facts
npm run verify         # independently verify the built bundle (16 checks)
npm test               # unit tests for the asar writer + injection planner
npm run harness        # generate build/rtl-harness.html, a live payload demo

npm run parity:dry     # show the MCP/skill plan for ZCode; writes nothing
npm run parity         # give ZCode DSH's active MCP servers and skills
```

## DSH parity

`npm run parity` reads what **DSH** has active and writes it into **ZCode**:
the eight MCP servers DSH's profile enables (serena, context7, postgres,
chrome-devtools, searxng, codebase-memory, firecrawl-local, treg) become
enabled in ZCode, every other MCP server it can see is written with
`enabled: false`, the 31 model-visible skills are enabled, and the eleven DSH
shadows are switched off. The seven bundled `office*` skills and
`sync-opencode-free-models` are copied out of DSH into `~/.zcode/skills/`,
because ZCode cannot read them where they live.

See `docs/dsh-parity.md`.

## What "RTL" means here

In two places — **what you type** and **what the model answers** — text must use
Vazirmatn and read right-to-left. The rule is deliberately blunt:

> A paragraph renders RTL if it contains **at least one** Persian/Arabic
> character — even when it *starts* with an English word, a URL or punctuation.

`dir="auto"` and `unicode-bidi: plaintext` cannot express that: both key off the
*first strong* character, so `API docs: این روش کار می‌کند` would stay LTR. The
patch therefore ships a small direction engine that decides per block and writes
a real `dir` attribute. Code, terminals and math are pinned LTR so they are never
reordered. See [docs/rtl-rules.md](rtl-rules.md).

## How it works

`ZCode.app` is an Electron bundle. Its renderer documents live **inside**
`Contents/Resources/app.asar` and are loaded by the main process with
`loadFile`, so Electron serves them through `file://` straight out of the
archive. That makes the whole patch a three-part operation:

1. **Copy** the bundle with `ditto` (APFS cloning makes this take ~2 s).
2. **Patch `app.asar`** append-only: inject a `<link>`/`<script>` before
   `</head>` in each `out/renderer/*.html`, and add the payload under
   `out/renderer/`. Existing bytes are never moved, so a 327 MB archive is
   patched by streaming a copy rather than extract-and-repack.
3. **Fix up the bundle**: distinct bundle id / name / deep-link scheme, refresh
   `ElectronAsarIntegrity`, remove `app-update.yml` (so the RTL copy can never
   silently overwrite itself), rename the Electron `Helper` bundles, then
   ad-hoc re-sign with the original entitlements.

No `asar` CLI, no `electron-builder`, no npm dependencies. The archive reader and
writer are ~250 lines in [`src/asar.mjs`](../src/asar.mjs).

## Layout

| path | role |
| --- | --- |
| [`bin/zcode-rtl-patch.mjs`](../bin/zcode-rtl-patch.mjs) | the one entrypoint |
| [`src/asar.mjs`](../src/asar.mjs) | dependency-free asar reader / append-only writer |
| [`src/patch-app.mjs`](../src/patch-app.mjs) | pure planner: which entries to replace/add |
| [`src/bundle.mjs`](../src/bundle.mjs) | macOS bundle surgery (plist, helpers, codesign, fuses) |
| [`runtime/rtl.js`](../runtime/rtl.js) | direction engine (shipped into the asar) |
| [`runtime/rtl.css`](../runtime/rtl.css) | Vazirmatn + RTL styling (shipped into the asar) |
| [`runtime/fonts/`](../runtime/fonts) | bundled Vazirmatn variable WOFF2 |
| `bin/zcode-dsh-parity.mjs` | mirror DSH's active MCP servers and skills into ZCode |
| `src/dsh-parity.mjs` | read DSH, read ZCode, compute and apply the parity plan |
| `src/yaml-subset.mjs` | dependency-free parser for DSH's Cordis patch files |
| [`tools/inspect-asar.mjs`](../tools/inspect-asar.mjs) | read-only reconnaissance of any asar |
| [`tools/verify-asar.mjs`](../tools/verify-asar.mjs) | independent verification of the result |
| [`tools/make-harness.mjs`](../tools/make-harness.mjs) | self-contained browser harness for the payload |
| [`tools/make-font.py`](../tools/make-font.py) | regenerate the WOFF2 from a system Vazirmatn TTF |

`runtime/` mirrors the in-archive layout of `out/renderer/`, so the CSS's
relative `./fonts/vazirmatn-var.woff2` URL resolves identically in the archive
and in the harness.

## Documentation

- [docs/report.md](report.md) — what was done in this build and the evidence
- [docs/patch-structure.md](patch-structure.md) — anatomy of the patch, byte by byte
- [docs/rtl-rules.md](rtl-rules.md) — the direction contract
- `docs/dsh-parity.md` — how DSH's active MCP servers and skills reach ZCode
- [docs/knowledge-base.md](knowledge-base.md) — hard-won facts about this app
- [docs/troubleshooting.md](troubleshooting.md) — when something goes wrong

## Updating after a ZCode release

Nothing to remember but one command:

```bash
npm run patch
```

The patcher reads the version, bundle name and deep-link scheme from the source
bundle, so a rename or a version bump needs no code change. If a future release
adds a `Content-Security-Policy` meta or a new renderer window, both are handled
automatically (`relaxCsp` widens the policy; every `out/renderer/*.html` is
patched). Run `npm run verify` afterwards.

The RTL copy has auto-update disabled on purpose: it must never replace itself,
because doing so would discard the patch. The two apps coexist, and only the
original should be updated.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

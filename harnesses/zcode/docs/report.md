# Work report — ZCode RTL patch

## 1. Objective

Produce a repeatable patch that turns the installed **`ZCode.app`** (v3.14.4,
`dev.zcode.app`, Electron) into a Persian-friendly copy named
**`ZCode-RTL.app`**, such that:

1. the copy is generated *from* the original and the original is never modified;
2. in the **user's typing area** and the **model's answer area** the font is
   **Vazirmatn** and text reads **RTL**;
3. re-running after a ZCode update regenerates the copy from the fresh original
   (idempotent);
4. the patch, its structure and everything learned are documented here.

## 2. Findings (the reconnaissance that shaped the design)

| fact | value |
| --- | --- |
| app kind | Electron bundle, `Contents/Resources/app.asar` |
| archive size | 326,914,570 bytes; 27,060 packed entries (+3 unpacked) |
| header framing | `JSON_START = 16`; `jsonLen = 7,087,290`; `dataStart = 7,087,308` |
| source version | `CFBundleShortVersionString 3.14.4`, `CFBundleVersion 3.14.4.7912` |
| renderer documents | `out/renderer/{index,resource-manager,cua-permission-panel}.html`, **no CSP** in any |
| font plumbing | CSS variables `--font-sans` → `--default-font-family`; `--font-mono` for code |
| entitlement set | `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, `allow-dyld-environment-variables` |
| deep-link | scheme `zcode` |

### The `ElectronAsarIntegrity` puzzle (resolved)

Info.plist ships `ElectronAsarIntegrity.Resources/app.asar.hash =
c92e8a94…99995f`, but **no** framing of the archive reproduces it:

| candidate | sha256 |
| --- | --- |
| unpadded header JSON (what electron-builder / the Electron docs use) | `d3ec6aba…1a729` |
| JSON + zero padding | `7f1d234f…6770b` |
| `[0, dataStart)` | `50d73206…c315b` |
| `[4, dataStart)`, `[8, …)`, `[12, …)`, `[0, 16+jsonLen)` | none match |

Cross-checked against electron-builder's own source
(`app-builder-lib/src/asar/integrity.ts` → `hashHeader`, which hashes the JSON
string returned by `readAsarHeader`), so `sha256(unpadded JSON)` *is* the
canonical value — the shipped hash is simply stale.

**Why that is harmless:** the hash only matters when the
`EnableEmbeddedAsarIntegrityValidation` fuse is on. Reading the
`__ELECTRON_FUSES` wire out of `Electron Framework` gives
`<version 1><length 9>101100011`:

```
index 0 RunAsNode                          = 1
index 1 EnableCookieEncryption             = 0
index 2 EnableNodeOptionsEnvironmentVariable = 1
index 3 EnableNodeCliInspectArguments      = 1
index 4 EnableEmbeddedAsarIntegrityValidation = 0   ← disabled
index 5 OnlyLoadAppFromAsar                = 0
index 6 LoadBrowserProcessSpecificV8Snapshot = 0
index 7 GrantFileProtocolExtraPrivileges   = 1
index 8 WasmTrapHandlers                   = 1
```

So Electron never validates the hash. The patch still writes the *correct*
value (`sha256(unpadded header JSON)`) so the plist stays internally consistent,
and `tools/verify-asar.mjs` asserts that consistency.

**Confirmed empirically:** the built app launches and stays up (main process +
GPU + utility + **Renderer** helpers all alive). An integrity mismatch would
have terminated it instantly.

## 3. What was built

```
package.json                 manifest + scripts
bin/zcode-rtl-patch.mjs      CLI: dry-run | inspect | patch | install
src/asar.mjs                 reader + append-only writer (no deps)
src/patch-app.mjs            pure edit planner (injectHead, relaxCsp, planEdits)
src/bundle.mjs               plist, helper rename, codesign, fuse reader
runtime/rtl.js               direction engine
runtime/rtl.css              Vazirmatn + RTL styling
runtime/fonts/vazirmatn-var.woff2   111,152 bytes, wght 100..900
tools/inspect-asar.mjs       reconnaissance
tools/verify-asar.mjs        16-check verifier
tools/make-harness.mjs       self-contained browser harness
tools/make-font.py           TTF → WOFF2
test/asar.test.mjs           9 unit tests
docs/*                       this documentation set
```

### Design decisions worth recording

- **Append-only asar rewrite.** New bytes are appended to the data section and
  only the header is rewritten, so no entry offset changes and a 327 MB archive
  costs one streaming copy. Rejected alternative: `asar extract` + `asar pack`.
- **Inject into the HTML, touch no app code.** The main process's `loadFile`
  means a relative `<link>`/`<script>` before `</head>` is enough. No JS patch of
  the minified `out/main/index.js`.
- **`runtime/` mirrors `out/renderer/`.** The CSS's relative font URL resolves in
  the archive and in the local harness with no rewriting.
- **Distinct identity.** `dev.zcode.app.rtl`, `ZCode-RTL`, scheme `zcode-rtl`.
  Without the explicit scheme change the RTL copy would hijack `zcode://` links
  meant for the original.
- **`app-update.yml` removed.** electron-updater only self-updates when the file
  exists; keeping it would let the copy silently discard the patch.
- **Helper bundles renamed and their executables moved with them.** Electron
  looks helpers up as `<outer name> Helper*.app`; renaming only the outer bundle
  fails with *"Unable to find helper app"*.

### One improvement over the reference implementations

The reference engines keep code LTR only through a hardcoded CSS selector list.
Here the direction engine also *tags* any island it walks past with
`data-zcode-rtl-force-ltr`, so a code container nobody anticipated cannot inherit
RTL from a Persian ancestor.

## 4. Evidence

`npm test` — **9/9**

```
✔ reader parses a well-formed archive and walks its tree
✔ header digest is sha256 of the unpadded header JSON
✔ rewriteAsar appends without disturbing existing entries
✔ rewriteAsar refuses to replace a missing entry
✔ injectHead inserts once and is idempotent
✔ relaxCsp widens a restrictive policy and leaves a permissive one alone
✔ planEdits injects every renderer document and adds the payload
✔ planEdits is idempotent and rewrites rather than re-adds the payload
✔ align4 rounds up to the next 4-byte boundary
```

`npm run verify` — **16/16** on the installed bundle: distinct id/name/scheme,
updater removed, 4 helpers renamed with executables, plist hash matches the
archive header, 3 payload assets present, payload linked exactly once in each of
3 documents, `codesign --verify --deep --strict` clean.

`build/rtl-harness.html` (generated from the *real* payload) — **13/13**, plus
computed-style confirmation:

```
fa_dir = rtl          fa_textAlign = right       fa_direction = rtl
composer_font = Vazirmatn                        body_font = Vazirmatn
pre_direction = ltr   pre_attr = ""              fontLoaded = true
```

Runtime: full build (copy → patch → sign → install) completes in **~3.5 s** —
APFS clones the ~736 MB bundle, so the only real work is streaming the archive.
The archive grows 326,914,570 → 327,098,236 bytes (+183,666).

Determinism: two consecutive `--no-install` builds from the same pristine source
produce the identical header digest (`2b56cd64…`) and byte count, so a re-run is
a true rebuild rather than drift. (The digest includes each new entry's
`integrity` hash, so it legitimately changes when the payload changes — an earlier
build reported `737feb6a…` before `runtime/rtl.{js,css}` were improved.)

## 5. Status

Everything requested is implemented, built and verified against the live
ZCode 3.14.4 install. The original `/Applications/ZCode.app` is byte-identical
apart from nothing — it is never written to.

Open follow-ups, none blocking:

- The patch is applied to renderer **documents**; if a future ZCode release moves
  to a custom protocol handler or adds a CSP with a nonce, `relaxCsp` would need
  to grow a nonce-aware path. It currently already widens a static policy.
- No automated test drives the real app's UI; verification of the running app is
  process-level plus the payload harness. A CDP-based smoke test would close
  that gap if the app exposed a debug port.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

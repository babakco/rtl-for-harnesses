# Troubleshooting

Symptom → likely cause → fix.

## Build

**`source archive not found`**
ZCode is not at `/Applications/ZCode.app`. Point at it explicitly:
`node bin/zcode-rtl-patch.mjs --source /path/to/ZCode.app`.

**`this patcher targets macOS app bundles`**
Wrong platform. The patcher copies and re-signs a macOS bundle with `ditto`,
`codesign` and `PlistBuddy`.

**`required macOS command not found: ditto|codesign|xattr`**
A stripped-down environment. Xcode command line tools provide all three
(`xcode-select --install`).

**`unexpected outer pickle size N; not an asar archive`**
The file is not an asar, or it is one with an unsupported framing. Confirm with
`node tools/inspect-asar.mjs <file> --list`.

**`nothing to patch: every renderer document already carries the payload`**
Raised only when *no* document and *no* asset needed writing — i.e. you pointed at
an already-patched copy. Point `--source` at the pristine original.

**`no out/renderer/*.html documents found — ZCode layout changed`**
A future release moved the renderer. Run
`node tools/inspect-asar.mjs --list --grep '\.html'` and update `HTML_RE` /
`RENDERER_DIR` in [`src/patch-app.mjs`](../src/patch-app.mjs).

**`no </head> found while injecting the RTL payload`**
The document has no `</head>`. Inspect it with
`node tools/inspect-asar.mjs --dump out/renderer/<file>.html`.

## The app will not launch

**It closes immediately / no process after `open`**
Almost always the signature or the helper rename.

- `codesign --verify --deep --strict /Applications/ZCode-RTL.app` — must be clean.
  Re-run the patcher; step 6 re-signs every time.
- Check the helpers match the outer name:
  `ls /Applications/ZCode-RTL.app/Contents/Frameworks` should list
  `ZCode-RTL Helper*.app`, and each `Contents/MacOS` should hold an executable of
  the same base name as its `CFBundleExecutable`. A stale name gives
  *"Unable to find helper app"*.

**`"app.asar" is corrupted` / integrity abort**
This build's fuse is **disabled**, so integrity is not the cause — check the
signature instead. If a future release enables
`EnableEmbeddedAsarIntegrityValidation`, the plist hash must exactly equal
`sha256(unpadded header JSON)`; the patcher already writes that, and
`tools/verify-asar.mjs` asserts it. Verify with
`node bin/zcode-rtl-patch.mjs --inspect` (see `fuse.asarIntegrityValidation`).

**`killed` on first run after download**
Quarantine: `xattr -cr /Applications/ZCode-RTL.app` (the patcher does this).

**Two apps, wrong one opens from a link**
The deep-link scheme should be `zcode-rtl` in the RTL copy. Check
`/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes' <app>/Contents/Info.plist`.

## The copy patches itself away after a while

`Contents/Resources/app-update.yml` came back — i.e. the bundle was rebuilt from a
source that still had it, or you ran the original's updater into the RTL copy.
Re-run `npm run patch`. The patcher always removes it and
`tools/verify-asar.mjs` checks for its absence.

## The UI

**Wrong font, no Persian font at all**
- Confirm the assets reached the archive:
  `node tools/inspect-asar.mjs --list --grep 'zcode-rtl'`.
- Open the harness: `npm run harness && open build/rtl-harness.html`. If it passes
  there but not in the app, the document is not loading the payload — check the
  injected tags survived (`node tools/inspect-asar.mjs --dump out/renderer/index.html`).
- A *new* window that is not under `out/renderer/*.html` is not patched. Locate it
  and extend the pattern in `src/patch-app.mjs`.

**Persian text is RTL but the punctuation / numbers look wrong**
That is inherent bidi, not a direction bug: the block is RTL, subsequent LTR runs
(URLs, identifiers, numbers) are isolated but still ordered LTR. Do not "fix" it
by forcing the whole block LTR — that re-breaks the paragraph.

**An English paragraph flipped to RTL**
It contains an Arabic-script character somewhere (an Arabic comma, a Persian
digit, a zero-width non-joiner between Arabic letters). That is the intended rule.
To find it, log the offending text in the console; to exempt a container
permanently, add it to `FORCE_LTR_SELECTOR` in `runtime/rtl.js` and to the CSS
list in `runtime/rtl.css`.

**Code blocks are being reordered**
A code container whose class is unknown. It should be caught dynamically (any
element matched by `FORCE_LTR_SELECTOR` is tagged). If it is not matched at all,
add its selector to both `FORCE_LTR_SELECTOR` (JS) and the
`direction: ltr !important` list (CSS).

**The caret starts on the wrong side in the composer**
`syncField` reads `.value`; a rich-text composer that is `contenteditable` is
covered, but a custom editor that hides its real field is not. Check the element
with DevTools — if it is a `textarea` inside an iframe or shadow root, the
observer needs to reach that root.

**Nothing happens at all (no `dir` anywhere)**
`window.__ZCODE_RTL_INSTALLED__` was already set (double install) or
`window.__ZCODE_RTL_DISABLED__ === true`. The engine sets
`document.documentElement[data-zcode-rtl="on"]` when it starts — check for it.

## Verification

```bash
npm test                 # 9 unit tests
npm run verify           # 16 checks against the installed bundle
npm run patch:dry        # plan only, writes nothing
node bin/zcode-rtl-patch.mjs --inspect   # source facts + fuse state
```

If `npm run verify` fails on *"Info.plist asar hash matches the archive header"*,
the archive was modified after signing. Re-run `npm run patch`.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

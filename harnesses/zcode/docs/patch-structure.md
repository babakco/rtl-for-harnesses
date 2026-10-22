# Patch structure

Everything the patch does, in the order the CLI does it, with the reasoning for
each step. Read alongside [`bin/zcode-rtl-patch.mjs`](../bin/zcode-rtl-patch.mjs).

## 0. Sanity

Reads the source bundle's identity so nothing is hardcoded:

```
bundleId  = CFBundleIdentifier              → dev.zcode.app
name      = CFBundleName                    → ZCode
version   = CFBundleShortVersionString      → 3.14.4
scheme    = CFBundleURLTypes:0:CFBundleURLSchemes:0 → zcode
```

The output identity is derived: `dev.zcode.app.rtl`, `ZCode-RTL`, `zcode-rtl`.
A bundle rename or version bump in a future release therefore needs no code
change.

The Electron fuse wire is also read from
`Contents/Frameworks/Electron Framework.framework/**/Electron Framework` (see
[knowledge-base.md](knowledge-base.md#electron-fuses)) and reported, because it
decides whether the `ElectronAsarIntegrity` hash is enforced.

## 1. Copy

`ditto <source> <stage>/ZCode-RTL.app`. `ditto` preserves resource forks, ACLs
and signature metadata that a naive recursive copy drops. On APFS this is a
clone, so a ~736 MB bundle copies in about two seconds.

The stage is wiped first, so the build is a pure function of the source.

## 2. Patch `app.asar` (append-only)

The on-disk layout, all little-endian `u32`:

```
[0]   4                      outer "size pickle" payload size
[4]   4 + payloadSize        header pickle length
[8]   4 + padded(jsonLen)    header pickle payload size
[12]  jsonLen                byte length of the header JSON
[16]  jsonLen bytes          the header JSON, zero-padded to 4 bytes
      dataStart = 16 + align4(jsonLen)
      file data — each entry's `offset` is relative to dataStart
```

Verified on this archive: `jsonLen = 7,087,290`, `dataStart = 7,087,308`.

`rewriteAsar` never moves existing data:

1. every replacement/new payload is appended after the last original byte, so
   every existing `offset` stays valid;
2. the header JSON entries for those paths get `size`, `offset` (a **string**),
   and a per-file `integrity` block (`SHA256`, `blockSize` 4194304, one hash per
   block) — byte-for-byte the shape `@electron/asar` writes;
3. the longer header pickle is written in front;
4. a streaming copy recreates the file: new header + all original data bytes +
   appended payloads, written to `app.asar.zcode-rtl.tmp` and `rename`d into
   place so a failure can never leave a half-written archive.

Cost: one streaming pass, ~327 MB, no extract-and-repack, no `offset` rewrites.

`headerDigestFromJson` returns `sha256(unpadded header JSON)` for Info.plist.

### What is added

| entry | source |
| --- | --- |
| `out/renderer/zcode-rtl.css` | `runtime/rtl.css` |
| `out/renderer/zcode-rtl.js` | `runtime/rtl.js` |
| `out/renderer/fonts/vazirmatn-var.woff2` | `runtime/fonts/…` |

This mirrors the repository's `runtime/` layout, so the CSS's relative
`url("./fonts/vazirmatn-var.woff2")` resolves identically in the archive.

### What is replaced

Every `out/renderer/**/*.html` document, with a snippet inserted before the last
`</head>`:

```html
  <link rel="stylesheet" href="./zcode-rtl.css">
  <script src="./zcode-rtl.js" defer></script>
```

`prefixToRenderer` computes the relative prefix from the document's directory, so
a document in a subdirectory would still resolve. Injection is marker-guarded
(`zcode-rtl.css`), making a second pass a no-op — that is the idempotency lever on
the archive side.

`relaxCsp` is applied first: if a document carries a
`Content-Security-Policy` meta that would block a same-origin stylesheet, script
or font, the relevant directives gain `'self'`. The shipped documents have no CSP,
so this is a guard for future releases, not an active change.

## 3. Info.plist

```
CFBundleIdentifier                              dev.zcode.app.rtl
CFBundleName / CFBundleDisplayName              ZCode-RTL
CFBundleURLTypes:0:CFBundleURLName              ZCode-RTL
CFBundleURLTypes:0:CFBundleURLSchemes:0         zcode-rtl
ElectronAsarIntegrity:Resources/app.asar:algorithm  SHA256
ElectronAsarIntegrity:Resources/app.asar:hash       <recomputed header digest>
```

`CFBundleExecutable` is deliberately **not** touched: `Contents/MacOS/ZCode` is
the actual Electron entry point and renaming it would break the bundle.

The scheme change matters — without it the RTL copy would claim `zcode://` and
steal deep links meant for the original.

## 4. Disable the self-updater

`Contents/Resources/app-update.yml` is removed. electron-updater only activates
when that file exists, so the RTL copy can never replace itself and discard the
patch. Update the original, then re-run.

## 5. Rename the Electron helpers

`Contents/Frameworks/<name> Helper*.app` (`", " (GPU)"`, `" (Plugin)"`,
`" (Renderer)"`). For each, in this order:

1. move the `.app` directory to `<new name> Helper<suffix>.app`;
2. move `Contents/MacOS/<old> Helper<suffix>` → `<new> Helper<suffix>`;
3. rewrite `CFBundleExecutable`, `CFBundleDisplayName`, `CFBundleName`, and give
   `CFBundleIdentifier` the `…rtl.helper*` suffix.

Order matters: moving the executable out of the old directory first would leave
an empty target tree and strand the helper's `Info.plist`.

## 6. Re-sign

Extract the original's entitlements (`codesign -d --entitlements - --xml`), drop
`Contents/_CodeSignature`, then:

```
codesign --force --deep --sign - --entitlements <orig> --options runtime <app>
codesign --verify --deep --strict <app>
xattr -cr <app>
```

Ad-hoc (`-`) signing is correct here: the bundle id, name and contents changed,
so the original signature is invalid, and the app runs because it is not
quarantined. `allow-jit` and `disable-library-validation` must be preserved or
Electron will not start.

## 7. Install

`pkill` any running copy, replace `/Applications/ZCode-RTL.app` by `ditto` from
the stage, then drop the stage (unless `--keep-stage`).

## Machine-readable record

Each run writes `build/patch-report.json`: source + version, destination, bundle
id, scheme, header digest, fuse state, byte counts, the documents patched, the
assets, and the renamed helpers. `--json` also prints it.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

# Knowledge base

Reference notes gathered while building this patch. Facts, not narrative.

## asar on-disk format

Little-endian `u32` unless noted.

```
[0]    4                       outer "size pickle" payload size (always 4)
[4]    4 + payloadSize         header pickle length
[8]    4 + padded(jsonLen)     header pickle payload size
[12]   jsonLen                 byte length of the header JSON
[16]   jsonLen bytes           the header JSON, zero-padded to a 4-byte boundary
       dataStart = 16 + align4(jsonLen)
       file data; each entry's `offset` is a STRING relative to dataStart
```

- `dataStart = 16 + jsonLen + align4(jsonLen)`.
- `payloadSize = 4 + jsonLen + align4(jsonLen)`, `headerBufLen = 4 + payloadSize`.
- Note the JSON starts at **offset 16**, not 12. (An easy off-by-four: offsets 0–15
  are four size words, the second of which is the pickle buffer length.)
- For ZCode 3.14.4: `jsonLen = 7,087,290`, `headerBufLen = 7,087,300`,
  `payloadSize = 7,087,296`, `dataStart = 7,087,308`.

Entry fields: `{ size, offset: "string", integrity?, unpacked?, executable?,
link? }`. Directory nodes are `{ files: { … } }`. `@electron/asar` writes
`integrity = { algorithm: 'SHA256', hash, blockSize: 4194304, blocks: [...] }`
with one block hash per 4 MiB, and — importantly — a single `sha256('')` block for
a zero-byte file.

### Cheaper to append than to repack

Because every `offset` is relative to `dataStart`, appending new payload bytes and
only rewriting the header leaves every existing entry valid. Growing the header
shifts the data section in absolute terms, but that is a single streaming copy,
not a re-pack of 27,060 entries.

## Electron fuses

The fuse wire lives in the Electron binary inside the app bundle:

```
Contents/Frameworks/Electron Framework.framework/**/Electron Framework
```

Format: the 32-byte sentinel `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`, then a version
byte, a length byte, then `length` state bytes — `0x30` (`'0'`) disabled, `0x31`
(`'1'`) enabled, `0x72` removed, `0x90` inherit.

`FuseV1Options` order (index → name):

```
0 RunAsNode
1 EnableCookieEncryption
2 EnableNodeOptionsEnvironmentVariable
3 EnableNodeCliInspectArguments
4 EnableEmbeddedAsarIntegrityValidation
5 OnlyLoadAppFromAsar
6 LoadBrowserProcessSpecificV8Snapshot
7 GrantFileProtocolExtraPrivileges
8 WasmTrapHandlers
```

Reading it needs no dependency — scan the binary for the sentinel and read the
three fields. `src/bundle.mjs#readFuseWire` does exactly that;
`@electron/fuses#getCurrentFuseWire` does the same thing as a package.

**ZCode 3.14.4:** version `1`, length `9`, states `101100011` →
`EnableEmbeddedAsarIntegrityValidation` is **0 (disabled)**, `OnlyLoadAppFromAsar`
is `0`, `RunAsNode` is `1`.

## ElectronAsarIntegrity

`Info.plist → ElectronAsarIntegrity → "Resources/app.asar" → { algorithm, hash }`
with `algorithm = "SHA256"` and

```
hash = sha256(unpadded header JSON)
```

i.e. the exact JSON bytes on disk at `[16, 16 + jsonLen)`. This is what
electron-builder's `hashHeader` produces (`createHash('sha256').update(header)`
where `header` is the string returned by `readAsarHeader`, itself the JSON string
from the header pickle), and what the Electron docs mean by "`getRawHeader`'s
result can then be hashed".

It is only **enforced** when the `EnableEmbeddedAsarIntegrityValidation` fuse ison; a mismatch then terminates the app at startup.

On ZCode the fuse is off, so it does not matter that the shipped value
(`c92e8a94…`) is stale and does not match the current header (`d3ec6aba…`) — the
app runs fine. The patch still writes the correct recomputed digest so the plist
stays self-consistent, and the verifier asserts that it matches.

## Electron helper lookup

Electron starts its helper processes by looking for **`<outer bundle name>
Helper*.app`** in `Contents/Frameworks/`, where the name comes from the *outer*
bundle. Renaming only the outer bundle breaks the lookup and the app dies with
*"Unable to find helper app"*.

So a rename must move, together:

1. the `.app` directory → `<New> Helper<suffix>.app`
2. `Contents/MacOS/<Old> Helper<suffix>` → the new executable name
3. the helper's `CFBundleExecutable` (and ideally `CFBundleName` /
   `CFBundleDisplayName` / `CFBundleIdentifier`)

Move the directory *first*, then the executable inside it, or you strand the
helper's `Info.plist` in an empty target tree.

`CFBundleExecutable` of the *outer* bundle must not change: `Contents/MacOS/ZCode`
is the Electron entry point.

## electron-updater activation

`electron-updater` only activates when `Contents/Resources/app-update.yml` exists.
Deleting it disables auto-update without patching any code — the correct way to
stop the RTL copy from re-downloading and replacing itself (which would discard
the patch).

## Ad-hoc signing

macOS refuses to run a bundle whose signature no longer matches its contents.
After any edit, re-sign:

```bash
codesign --force --deep --sign - --entitlements <orig-entitlements> \
         --options runtime My.app
codesign --verify --deep --strict My.app
xattr -cr My.app
```

Entitlements must be *preserved*, not invented: Electron needs
`com.apple.security.cs.allow-jit` and
`com.apple.security.cs.disable-library-validation` to start. Read the original's
with `codesign -d --entitlements - --xml <app>`.

## This app (ZCode 3.14.4)

- bundle id `dev.zcode.app`, name `ZCode`, executable `ZCode`, scheme `zcode`
- entitlements: `allow-dyld-environment-variables`, `allow-jit`,
  `allow-unsigned-executable-memory`, `disable-library-validation`
- `Contents/Resources`: `app.asar` (326,914,570 B), `app.asar.unpacked/`
  (`node_modules` only), `app-update.yml`, `config/`, `cua-helper/`, `glm/`,
  `tools/`, icons
- `app.asar.unpacked` holds unpacked entries; the reader resolves those from
  `<asar>.unpacked/<path>`
- renderer documents: `out/renderer/index.html` (main window),
  `out/renderer/resource-manager.html`, `out/renderer/cua-permission-panel.html`
  — **no** `Content-Security-Policy` meta in any of them
- the main process loads them with `loadFile`, so Electron serves them over
  `file://` straight out of the archive and relative `<link>`/`<script>` work
- font plumbing: `--font-sans` (= `ui-sans-serif, system-ui, …`),
  `--font-mono`, `--default-font-family: var(--font-sans)`,
  `--ui-font-size: 14px`; the only built-in `@font-face` rules are KaTeX's

## Vazirmatn

The bundled `runtime/fonts/vazirmatn-var.woff2` (111,152 bytes) is the variable
font, `wght 100..900`.

```
sha256 4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92
```

Regenerate from a system variable TTF (`~/Library/Fonts/Vazirmatn[wght].ttf`)
with `tools/make-font.py` (needs `fontTools`) via
`node bin/zcode-rtl-patch.mjs --rebuild-font`.

## Command cheat sheet

```bash
# what is in the archive?
node tools/inspect-asar.mjs /Applications/ZCode.app/Contents/Resources/app.asar --html
node tools/inspect-asar.mjs --list --grep 'renderer/.*\.css'
node tools/inspect-asar.mjs --dump out/renderer/index.html | head
node tools/inspect-asar.mjs --tree out/renderer

# what would the patch change?
node bin/zcode-rtl-patch.mjs --dry-run

# what is true about the result?
node tools/verify-asar.mjs

# is the payload behaving?
node tools/make-harness.mjs && open build/rtl-harness.html
```
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

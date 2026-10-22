# Claude Desktop RTL Live Patch for macOS

Patches the **original** `/Applications/Claude.app` **in place** with minimal
changes to add automatic right-to-left (RTL) text support (Hebrew, Arabic,
Persian) — both in the chat input and in Claude's responses — while code
blocks stay left-to-right. Optionally applies the app-wide font (e.g. Vazirmatn)
**scoped to text elements only**, so buttons and icons keep their native look.

> **Based on [claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch) by [@shraga100](https://github.com/shraga100)**
> (Windows). The RTL detection JavaScript is from that project; this repository
> adapts the patching mechanism for macOS.

## Why patch in place?

- The app keeps its **own profile** (`~/Library/Application Support/Claude`) →
  CC Switch providers and the Claude Code tab keep working exactly as before.
- Minimal footprint: only the renderer payload is injected + the ASAR
  integrity fuse is disabled + ad-hoc re-signing. Nothing else changes.
- A full backup (Anthropic-signed) is created automatically for restore.
- Auto-updates keep working: after every update the patch is wiped, so you
  simply re-apply it (one command).

## 📚 Documentation

- **Standard guide:** [`docs/live-patch/README.md`](live-patch/README.md)
- **Quick re-apply card (after each update):** [`docs/live-patch/QUICK-START.md`](live-patch/QUICK-START.md)

## Two-version workflow (original + RTL) — the standard flow

Keep `/Applications/Claude.app` as the **original** (Anthropic-signed, so
auto-updates keep working) and maintain a separate **RTL copy** that you run
every day:

```bash
# "Patch it" = copy the current original over the RTL app, then patch the copy.
# The RTL app is always the latest version because it is re-copied from the
# (updated) original each time.
./patch-live.sh --make-rtl --font Vazirmatn
```

- **Original** stays at `/Applications/Claude.app` — never modified, updates normally.
- **RTL app** is created at `~/Applications/Claude-RTL.app` (copy + patched);
  a shortcut **`/Applications/Claude RTL.app`** points to it.
- After every Claude update, just say **"پچ کن"** — it means run `--make-rtl`,
  which copies the freshly-updated original over the RTL app and patches it, so
  the RTL version is always the most up-to-date.
- Override the destination with `RTL_APP_DEST=/path/to/app ./patch-live.sh --make-rtl ...`
- ⚠️ Both apps share the bundle id `com.anthropic.claudefordesktop` and the same
  profile — don't run both at the same time. Quit one before opening the other.

## Quick start

```bash
# ★ THE standard command: "پچ کن" — copy the current original over the RTL app
#   and patch the copy, so the RTL app is always the latest version.
./patch-live.sh --make-rtl --font Vazirmatn

# In-place patch of /Applications/Claude.app (single-app setup, NOT the
# two-version flow — this modifies the original)
./patch-live.sh --install --font Vazirmatn

# Only when the script's payload changed (e.g. new font rules) but the app
# still carries the previous patch: strip and re-inject
./patch-live.sh --install --font Vazirmatn --force

# Check status
./patch-live.sh --status

# Restore /Applications/Claude.app from the Anthropic-signed backup
./patch-live.sh --restore
```

## What it does

- **Chat input & responses**: automatic RTL alignment for Hebrew/Arabic/Persian
- **Code blocks**: always stay LTR (monospace)
- **Math expressions**: LaTeX/KaTeX/MathJax always stay LTR
- **Font (optional `--font NAME`)**: applied **scoped to text elements**
  (`p/li/h1-6/blockquote/td/th/span/div/...`), **not** to buttons, icons, inputs,
  or SVG — so controls keep their native glyphs. Code stays monospace.
  `Vazirmatn` (Persian/Arabic, OFL) is bundled in `fonts/`.
- **Non-destructive**: backup at `~/Applications/Claude.app.pre-rtl-backup`;
  restore with `--restore`.

> **Why scoped (not `body *`)?** An earlier version forced the font with
> `html,body,body * { font-family: ... !important }`. That made Claude's buttons
> render their text/SVG icons invisible (still clickable) app-wide, because the
> app's own control fonts were overridden everywhere. Scoping the family to text
> elements and explicitly excluding buttons/icons/SVG fixes that.

## Requirements

- **macOS** with **Claude Desktop** at `/Applications/Claude.app` (user-owned)
- **Node.js** (v16+) — `npx` runs `@electron/asar` and `@electron/fuses`
- **Xcode Command Line Tools** — for `codesign`

## Project structure

```
claude-desktop-rtl-mac/
├── patch-live.sh          # The patcher (in-place, minimal; --make-rtl builds a copy)
├── rtl-payload.js         # RTL detection JS (injected into renderers)
├── fonts/                 # Bundled fonts (Vazirmatn, OFL)
├── docs/
│   └── live-patch/
│       ├── README.md      # Standard guide
│       └── QUICK-START.md # Re-apply card after updates
└── LICENSE
```

## Troubleshooting

- **White/blank window after patching** → stale session: quit and reopen; if it
  persists, Sign out → Sign in once in the app.
- **Buttons look empty (no icon/text) after applying the font** → you are
  running an older patch with the global `body *` font rule. Re-run with `--force`
  to re-inject the scoped rules:
  `./patch-live.sh --install --font Vazirmatn --force`
- **Only official models / Code tab inactive** → session too old for the
  `claude_code` scope (`session_stale_relogin` in `~/Library/Logs/Claude/main.log`).
  Fix: Sign out → Sign in (a fresh session). Note: the main chat always uses
  official Anthropic models — local models appear in the **Code tab** only.
- **Keychain prompt** ("Claude Safe Storage") after first patch launch →
  approve it (one-time, expected with a new signature).

## License

MIT — see [LICENSE](../LICENSE).
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

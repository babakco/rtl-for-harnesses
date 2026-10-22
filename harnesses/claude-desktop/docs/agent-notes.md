# CLAUDE.md

Guidance for Claude Code / agents working on this repository.

## What this repo is

A single-purpose macOS patcher that adds RTL (Hebrew/Arabic/Persian) text
support to Claude Desktop by patching `/Applications/Claude.app` **in place**
with minimal changes:

1. Injects `rtl-payload.js` (RTL detection, from the upstream Windows project
   [shraga100/claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch))
   + an optional app-wide font injector into every renderer file under
   `.vite/build/*.js` (except the Electron main-process entry).
2. Repacks `app.asar`, disables the `EnableEmbeddedAsarIntegrityValidation`
   fuse (required — the archive hash changed), and re-signs ad-hoc with the
   original entitlements (team-id keys stripped).

The app keeps its own profile, so CC Switch providers and the Claude Code tab
keep working. A backup of the untouched app is created at
`~/Applications/Claude.app.pre-rtl-backup`.

## Commands

```bash
./patch-live.sh --make-rtl --font Vazirmatn   # ★ STANDARD "پچ کن" flow: copy original ->
                                              #   ~/Applications/Claude-RTL.app and patch the COPY.
                                              #   The RTL app is always the latest version because
                                              #   it is re-copied from the (updated) original.
./patch-live.sh --install --font Vazirmatn   # in-place patch of /Applications/Claude.app (single-app setup)
./patch-live.sh --install --font Vazirmatn --force  # strip previous header + re-inject (after payload changes)
./patch-live.sh --status                     # show patch state (incl. RTL copy)
./patch-live.sh --restore                    # restore the Anthropic-signed backup to /Applications/Claude.app
```

The standard workflow: `/Applications/Claude.app` is the **original**
(Anthropic-signed, auto-updates). When the user says **"پچ کن"**, run
`--make-rtl`: it copies the current original over `~/Applications/Claude-RTL.app`
(replacing the old RTL app) and patches the copy — so the RTL app always equals
the latest original + the patch. A shortcut `/Applications/Claude RTL.app`
points to the RTL app.

There is no test suite or build step; the artifact is the patched `.app`.
Runtime deps: `npx` (Node ≥16), `codesign` (Xcode CLT).

## Key implementation notes

- `build_font_injector()` embeds `fonts/*.woff2/.woff/.ttf/.otf` as base64
  `data:` URIs (`@font-face`) and applies the family **SCOPED to text elements**
  — `p/li/h1-6/blockquote/td/th/summary/label/legend/dt/dd/figcaption/caption/
  span/div` — and **explicitly excludes** `button/a/input/textarea/select/svg/
  code/pre/kbd/samp/[role='button']/[class*='icon']/[data-testid*='button']/
  [data-testid*='icon']` (they keep the app's own font), keeping `pre/code`
  monospace. The code rule MUST come after the text rule (same specificity,
  later wins).
- ⚠️ Do NOT switch back to a blanket `html,body,body *{font-family:...!important}`
  rule. That was the root cause of a regression where Claude's buttons rendered
  their text and SVG icons invisible (still clickable) app-wide, including in
  the Settings menu. Scoping to text elements + excluding controls fixed it.
- `--make-rtl` copies `/Applications/Claude.app` to `$RTL_APP_DEST`
  (default `~/Applications/Claude-RTL.app`), then patches the copy (FORCE=1 so a
  stale header is stripped). The original app is never modified, so its
  Anthropic signature and auto-update keep working. Both apps share bundle id
  `com.anthropic.claudefordesktop` and the same profile — never run them at the
  same time.
- Injection is idempotent via the `CLAUDE RTL PATCH START`/`END` markers.
  `--force` strips everything from the first `PATCH START` to the last
  `FONT END` marker (python3) before re-injecting — needed when the payload
  changed but the app still carries an older header.
- The Electron main entry (from `package.json` `"main"`) is never injected —
  injecting there crashes startup (no BrowserWindow).
- The ASAR fuse must be disabled (`@electron/fuses`) or Electron refuses to
  load the modified archive.
- Re-signing strips `com.apple.application-identifier`,
  `com.apple.developer.team-identifier`, `keychain-access-groups` (they carry
  Anthropic's team ID and are rejected under ad-hoc signatures). Other
  entitlements (e.g. virtualization for Cowork) are preserved.
- Auto-updates keep working; each update wipes the patch (new Anthropic-signed
  build), so the documented workflow is: re-run `--make-rtl` (or `--install`)
  after updates.
- The Claude chat UI (composer, stop button, "Chat Font" setting) is rendered
  from the claude.ai web app inside the main window — those settings live in the
  web app, not in the local build. Don't expect to find them in `.vite/build`.
- Common failure modes to watch:
  - `session_stale_relogin` in `~/Library/Logs/Claude/main.log` → stale OAuth
    session; the fix is Sign out → Sign in in the app (server-side policy, not
    a patch bug).
  - "white/blank window" right after patching → stale session; quit/reopen or
    re-login once.
  - `patch-live.sh` argument parsing is a plain `while` loop — keep it that
    way; a `case "${1}"` on the first arg only would silently drop
    `--font`/`--force`.

## Docs

`docs/live-patch/README.md` (standard guide, Persian) and
`docs/live-patch/QUICK-START.md` (re-apply card).
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

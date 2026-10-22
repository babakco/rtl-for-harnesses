# Verification evidence — v1.18.1 (2026-09-05)

Machine: macOS Apple Silicon, 16 cores, Xcode 26.6, rustup toolchain **1.97.1**
(pinned by upstream `rust-toolchain.toml`).

## 0. Zed-RTL.app built from the INSTALLED Zed (primary deliverable)

```
$ ./scripts/make-rtl-app-from-installed.sh
==> Source: /Applications/Zed.app (version 1.18.1)
    (removed upstream embedded.provisionprofile)
    signature OK
==> Installed: /Applications/Zed-RTL.app
    binary identical to stock Zed 1.18.1   # (modulo signature, see below)
Identifier=dev.zed.Zed-RTL / Signature=adhoc
```

- `codesign --verify --deep --strict /Applications/Zed-RTL.app` → OK
- Original `/Applications/Zed.app` untouched, still Apple-valid
  (`Identifier=dev.zed.Zed`, `TeamIdentifier=MQ55VZLNZQ`).
- Code-identity proof: copies of both `Contents/MacOS/zed` binaries were run
  through `codesign --remove-signature`; the unsigned files are the **same
  size (419,056,120 bytes)** and differ in only **3 bytes** (Mach-O header
  fields accounting for the signature load command). All code pages identical.
- Changed files vs stock: `Contents/Info.plist` (name/bundle-id/scheme) only.

## 1. Patches apply cleanly on pristine tag source

```
$ git show v1.18.1:crates/markdown/src/markdown.rs > ...   # pristine base
$ git apply --check -v patches/v1.18.1/*.patch
Checking patch crates/markdown/src/rtl.rs...
Checking patch crates/markdown/src/markdown.rs...
Checking patch crates/agent_ui/src/message_editor.rs...
ALL_CHECKS_PASSED
```

Applied diff stat on the real tree (`~/src/zed-rtl-build @ v1.18.1`):

```
crates/agent_ui/src/message_editor.rs | 28 +++++++++++++++++++++++++++-
crates/markdown/src/markdown.rs       | 12 +++++++++++-
2 files changed, 38 insertions(+), 2 deletions(-)
(+ new file crates/markdown/src/rtl.rs, untracked)
```

## 2. Type-check passes with zero errors

```
$ cargo check -p markdown
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1m 00s
$ grep -c "^error" check-markdown.log
0

$ cargo check -p agent_ui
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1m 21s
$ grep -c "^error" check-agent_ui.log
0
```

Only warning: future-incompat in third-party crate `block v0.1.6`
(unrelated to this patch).

## 3. Standalone RTL-logic tests

```
$ cd tests/rtl_logic && cargo test
test result: ok. 4 passed; 0 failed
$ cargo run
all 14 cases passed
```

## 4. Settings merge test

`scripts/apply-settings.sh` tested against a copy of the real
`~/.config/zed/settings.json` (which contains comments + trailing comma):
8 font keys merged, all pre-existing user keys preserved byte-identical.

## 6. Full source build WITH patches → real auto-RTL app (2026-09-06)

Per user approval, `./scripts/build-zed-rtl.sh v1.18.1` ran to completion:

```
Applied patch crates/markdown/src/rtl.rs cleanly.
Applied patch crates/markdown/src/markdown.rs cleanly.
Applied patch crates/agent_ui/src/message_editor.rs cleanly.
   Compiling markdown v0.1.0 (.../crates/markdown)
   Compiling agent_ui v0.1.0 (.../crates/agent_ui)
Bundled .../target/aarch64-apple-darwin/release/bundle/osx/Zed.app
==> DONE: /Applications/Zed-RTL.app (from Zed v1.18.1 + ZED-RTL patches)
```

- Installed as `/Applications/Zed-RTL.app`
  (`dev.zed.Zed-RTL`, 1.18.1, `codesign --verify --deep --strict` OK).
- Previous copy preserved at `/Applications/Zed-RTL.app.backup-*`.
- `"auto_update": false` added to `settings/zed-rtl.settings.json` + applied:
  the patched app must never self-replace with a stock build.

## 7. Functional tests on the ACTUAL shipped code path

(a) App launch: `open -a Zed-RTL.app` → process runs, no panics; log shows
normal init (telemetry/update checks) and live agent usage
(`Thread::send called`, model `codestral-latest`). Headless `screencapture`
is unavailable in this session, so visual confirmation is the user's.

(b) Headless markdown-pipeline test (temporary `#[gpui::test]` added to the
build checkout, run, then reverted — checkout now holds only the 2 patches):

```
test tests::zed_rtl_tmp_persian_lines_align_right ... ok
test result: ok. 1 passed; 0 failed (159 filtered out)
```

Proven through the real render stack
(`Markdown::new → parse → flush_text → RenderedLine.text_align`):

| input | alignment |
|---|---|
| `Hello, این یک تست است` (English-first + Persian) | **Right** ✅ |
| `سلام دنیا` | **Right** ✅ |
| `Hello world` | Left ✅ (unchanged) |
| code block containing `"سلام"` | Left ✅ (code stays LTR) |

## 9. v2 fixes — user-reported gaps in the first RTL build (2026-09-06)

User report (with screenshot): input box flips RTL ✅, but model responses
stayed LTR; caret not at visual line end; Persian word spacing too wide.

Root causes found by reading the render path:

1. **Responses LTR**: `RenderedLine.text_align` only drives selection quads
   and hit-testing (`alignment_offset_for_segment`,
   `source_index_for_position`). Glyph positions come from the ambient block
   div style at layout time (`TextLayout::layout` reads `window.text_style()`),
   and runs carry no alignment (`TextRun` has font/color/underline only).
   Fix: per-block RTL flags in the builder (`block_rtl_stack`, synced with
   `push_div`/`pop_div`), div set to `text_right()` at paragraph/heading pop.
   Explicit table Center/Right still wins; code blocks excluded.
2. **Word spacing**: input used monospace primary + Vazirmatn fallback, so
   spaces came from the mono font with wide advances. Fix: input
   `font_family` is now Vazirmatn directly (single-font metrics).
3. **Caret**: `layout_visible_cursors` placed the caret by logical index; at
   logical line end that is the wrong edge for RTL. Fix (gated on
   `text_align == Right`, which only the input box sets): end-caret →
   visual left edge, start-caret → right edge. Self-correcting if the shaper
   ever becomes fully bidi-aware.

Verification for v2: `cargo check -p markdown -p agent_ui -p editor` → 0
errors, 0 warnings in our crates; `rustfmt --check` clean; all 3 patches
`git apply --check` clean on pristine `v1.18.1`; incremental release rebuild
(only the 3 crates + dependents, log shows all recompiled) → 0 errors →
rebundled, rebranded, strict-signed, installed over previous copy (backed up
as `Zed-RTL.app.backup-*`). User to restart the app and confirm visually.

## 8. Known non-issues seen during verification

- Mistral API `429 Rate limit exceeded` in the app log is the user's model
  quota, unrelated to this patch.
- Telemetry / auto-update / ACP-registry network timeouts in the log come
  from the sandboxed session lacking direct internet; harmless.

## 9. v3 — right-edge clipping fix (2026-09-06)

User report: ~1.5 chars on the right invisible when viewing/typing Persian.

Findings/fixes (all verified: cargo check 0 errors, rustfmt clean,
`git apply --check` clean on pristine v1.18.1, release rebuild 0 errors):

1. **Input box**: the expand button is absolutely positioned at
   `top_0/right_0` over the editor with only `pr_2p5` (10px) clearance —
   covers ~1.5 Persian glyphs of the first row. Fix (new patch
   `04-agent-thread-padding.patch`): container clearance `pr_2p5` → `pr_6`.
2. **Responses**: RTL paragraph/heading divs now also get `pr_4`, mirroring
   the existing root `pl_4`, so right-aligned glyphs keep breathing room
   from the right edge (folded into `01-markdown-rtl.patch`).
3. Headless measurement attempt showed logical lines span the full width in
   both directions (wrapping is internal), i.e. no overflow inside the
   markdown element itself — consistent with the overlay/padding theory.

Installed as `/Applications/Zed-RTL.app` (previous v2 backed up).

## 10. v4 — permanent scrollbar-lane reservation (2026-09-06)

Analysis conclusion after eliminating padding/scrollbar/gutter/wrap/shaping
suspects one by one (live-log row math is exact; headless markdown overflow
is 0.0; copy is complete; box intact): the remaining constant right-side
deficit behaves like a fixed overlay lane that only content hugging the
right edge (RTL) ever touches — ragged LTR rows end 20px+ earlier and never
reach it. The thread scrollbar never reserves space
(`ReservedSpace::Thumb.needs_space_reserved() == false`).

Fix (new `04-agent-thread-padding.patch`, plus `01` keeps `pr_4`):

- thread conversation container: permanent `.pr_3p5()` (14px = Regular track
  6px + 2x4px padding), so no overlay can sit on text;
- user-message bubble container: `.pr_4()` on top of `px_2`;
- message-editor input clearance `pr_2p5` → `pr_6` (expand button, kept).

Also: temporary ZEDRTL diagnostic logging added, used (proved exact local
layout), then fully removed — final patches contain zero diagnostics.
Distinct green "RTL" dock icon shipped (`assets/Zed-RTL.icns`, applied by
`make-rtl-app-from-installed.sh`) so stock Zed and Zed-RTL can no longer be
confused (identical icons were a real testing hazard).

## 11. v5 — upside-down wrapped RTL rows (2026-09-06, the real root cause)

Decisive evidence (user pasted the exact source sentence + screenshot):
a 3-row Persian paragraph displayed with the logical TAIL on top
("کنم؟..." first) and the logical HEAD ("سلام!...") at the bottom.

Root cause (proven with a Swift/CoreText probe on this machine): CoreText
returns RTL glyph runs in VISUAL order (right-to-left painting sequence,
ascending x, descending logical indices), and GPUI wraps/paint/hit-tests
assume vec order == top-down row order — true for LTR, upside-down for RTL.
Single-row text was always fine (no rows to stack), which is why short
texts worked and only wrapped paragraphs looked "cut".

Fix (`05-gpui-rtl-rows.patch`, strictly gated — LTR byte-identical):

- `glyphs_run_visual_rtl()` detector (first vs last logical glyph index)
  + `WrappedLineLayout::is_visual_rtl()` (also requires wrapped rows)
  + `chunk_logical_spans()` TRUE per-chunk spans;
- `paint_line` + `paint_line_background`: rows assigned bottom-up for RTL;
- `WrappedLineLayout::_index_for_position` / `position_for_index`: mirrored
  row mapping; `x_for_index` / `font_id_for_index`: smallest-index match
  (exact glyph for visual vecs; identical results for LTR);
- markdown `source_index_for_position` + selection-quad row emission
  mirrored via TRUE spans (LTR loop kept verbatim);
- editor untouched (its paint/hit-test paths pass empty boundaries, so all
  gates stay off for editor buffers).

Verification: 5 new font-free unit tests (synthetic visual-order vecs) green;
FULL suites green with zero failures — gpui lib 267, markdown 160, editor
937. Installed as `/Applications/Zed-RTL.app` (previous backed up).

## 12. v6 — word-level wrap for RTL scripts (2026-09-06)

User evidence (exact source sentence + screenshot): a row broke mid-word at
the ZWNJ ("می‌|وانم"), which reads as clipped text. Root cause: GPUI's
`LineWrapper::is_word_char` knew Latin/Cyrillic/Bengali but no Arabic-script
letters, so Persian wrapped character-by-character (CJK-style), and ZWNJ was
a break opportunity.

Fix (folded into `05-gpui-rtl-rows.patch`): Hebrew, Arabic (incl. Persian),
Syriac, Thaana, NKo, Samaritan/Mandaic, Arabic Extended-A/B, presentation
forms, plus ZWNJ/ZWJ glue are now word characters — wrapping breaks at
spaces only. Also fixes emoji ZWJ sequences splitting. Callers are wrapping
only (`wrap_line`, truncate path, `compute_wrap_boundaries`); word selection
uses a separate classifier and is untouched. Existing + extended
`test_is_word_char` (سلام، می‌توانم، کمکتان، مرحبا، שלום، ۱۲۳۴۵) green.

## 13. v7 — gutter-margin shift clipped RTL editor rows (2026-09-06)

Live instrumentation (temporary `ZEDRTL-G` logging, since removed) measured
global boxes while the user typed Persian: every RTL row's painted right
edge landed exactly `margin` (~7px) past the text-hitbox clip, while LTR
rows (ragged, never reaching the edge) were immune. Root cause: editor
content is shifted right by the gutter margin
(`content_origin = hitbox.origin + margin`) while alignment is computed
against the unshifted hitbox width — right-pinned rows overshoot the clip.

Fix (`03-editor-cursor-rtl.patch`): skip that shift for right-aligned
editors (all downstream math keys off `content_origin`, so it stays
coherent; LTR path byte-identical). Also locked in the user's symbol-first
rule with 3 new standalone cases (`؟Hello...؟`, `...سلام...`, `(test)...`;
17/17 green).

## 14. v8 — visual arrow keys + input 17pt (2026-09-07)

- Arrow keys moved the caret logically (Right = +column), which reads as
  backwards in RTL text. `move_left/right/select_left/select_right`
  (`06-editor-arrows-rtl.patch`, editor core) now swap direction on rows
  containing Persian/Arabic/Hebrew (per-caret row check, single-line fetch).
  LTR rows and the full editor suite (937 passed, 0 failed) unchanged.
- Typing-box font: agent_ui + 2pt (=18) was too big → now +1pt (=17).
- Space-transient: all measurable state proven correct (CoreText puts the
  trailing space left per UBA — Swift probe; caret mirror fires — live log;
  columns are byte units). Left as known-transient, still under observation.

## 15. v9 — trailing space stays at the visual line end (2026-09-07)

- Symptom: right after typing space in a Persian paragraph, the words
  jumped left and the caret jumped to the far right; the next character
  snapped everything back.
- Root cause (proven, not guessed): CoreText hangs a trailing logical
  neutral at *negative* x for RTL lines — probe: `"سلام "` shaped the
  space at x=-4.45 with the word at [0, 27.67]. Right-aligned painting
  then shifted the words left by the space width. A Swift probe proved
  neither `CTLine` nor `CTTypesetter` honors an RTL base writing
  direction for this case, so the FFI approach was abandoned.
- Fix (`07-gpui-macos-rtl-space.patch`, gpui_macos only): when an RTL
  line has glyphs at negative x, shift all glyph positions right so the
  content lives inside [0, width]. A Rust-vs-upstream probe over 8
  strings (pure RTL, trailing/leading/lone spaces, LTR, mixed
  "Hello سلام") shows byte-identical layouts except the two
  trailing-space cases, which move rigidly (width unchanged).
- The caret lands correctly through the existing 03 end-mirror
  (`x_for_index(len)` still falls back to `width`); no 03/05 change needed.
- Suites: gpui_macos 10, gpui 267, markdown 160, editor 937 — all green.

## 16. نسخه پایدار v9 (2026-09-07) — تأیید نهایی کاربر ✅

کاربر هر سه مورد آخر را تأیید کرد: اسپیس بدون پرش، فلش‌های بصری، فونت ۱۷.
این نسخه «بهترین نسخه تولیدشده» اعلام و تگ شد: `zed-rtl-v1.18.1-v9`.
نصب فعلی `/Applications/Zed-RTL.app` همین بیلد است (بکاپ‌های قبلی با
پسوند تاریخ کنارش هستند). درخت کار تمیز و همه پچ‌ها `apply --check`
خورده‌اند؛ لاگ موقت diagnóstico باقی نمانده است.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

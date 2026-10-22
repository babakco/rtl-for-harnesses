# RTL rules

The contract the payload implements, why it cannot be done in CSS alone, and the
placements that are deliberately exempt.

## The rule

> A block renders **RTL** if any text node inside it contains **at least one**
> Arabic-script character — regardless of what the block's first strong character
> is, and regardless of which script dominates.

Script ranges tested:

```
0600–06FF  Arabic
0750–077F  Arabic Supplement
08A0–08FF  Arabic Extended-A
FB50–FDFF  Arabic Presentation Forms-A
FE70–FEFF  Arabic Presentation Forms-B
```

The presentation forms matter because text pasted from office documents or PDFs
sometimes arrives pre-shaped.

## Why not `dir="auto"` or `unicode-bidi: plaintext`

Both use the **first strong character** to decide direction. For a coding
assistant, the commonest paragraph in the world is:

```
API docs: این روش کار می‌کند.
```

That starts with `A`, so both mechanisms leave it LTR and the Persian half renders
with the punctuation on the wrong side. There is no CSS selector for "contains a
character from this range", so a small JS pass decides per block and writes a real
`dir` attribute. `runtime/rtl.js` is that pass.

## Granularity: the paragraph, not the word

One pass maps every non-empty text node to its nearest **block** ancestor, then
aggregates "does this block contain the script" and marks the block. Inline tags
(`span`, `a`, `b`, `strong`, `em`) are deliberately *not* blocks, so their text
folds into the surrounding paragraph — which is exactly the requested granularity.

The climb stops at `document.body`/`documentElement`: a bare text node directly
under `#root` cannot flip the whole application.

## What is never touched

`FORCE_LTR_SELECTOR` — code, terminals, math, diffs. Reordering these is never
correct and is the fastest way to make a patch look broken:

```
pre, code, kbd, samp, tt, var, script, style
.xterm*  .monaco-editor*  .cm-editor .cm-content .cm-line
.katex .katex-display .math  .hljs .code-block .shiki .diff …
[data-zcode-rtl-force-ltr]
```

Two layers protect them:

1. **Dynamic** — any element `closest()`-matched during a walk is tagged
   `data-zcode-rtl-force-ltr`, so an unanticipated code container is pinned by
   attribute rather than by guessing its class name.
2. **Static** — `runtime/rtl.css` forces `direction: ltr !important` on the
   generic tags plus the known editor classes and the tag attribute.

## Attribute ownership

The engine only ever removes a `dir` it wrote (`owned`, a `WeakSet`). A block that
is English-only carries **no** `dir` attribute at all — the app's own LTR default
already applies there, and writing one would mean fighting the renderer over
markup the patch does not own.

## The composer and other editable fields

`input`, `textarea` and `contenteditable` are handled separately, because their
value is not a text node:

- `syncField` reads `.value` (or `textContent`) and sets `dir` from it;
- a capture-phase `input`/`change` listener runs *before* the app reacts, so the
  caret lands on the correct side immediately;
- `syncPlaceholders` uses a Persian `placeholder` to decide the caret side before
  anything is typed.

An empty field is left LTR.

## Liveness

Streaming is the normal state of an assistant answer, so a `MutationObserver` on
`documentElement` re-runs the pass over only the mutated subtree, coalesced into a
`requestAnimationFrame`. A 3 s interval sweep and a `focus` sweep clear stale
marks if the renderer reuses a node without a mutation the observer saw.

`window.__ZCODE_RTL_DISABLED__ = true` is the debugging escape hatch;
`window.__ZCODE_RTL_INSTALLED__` guards against a double install.

## Fonts

`runtime/rtl.css`:

- `@font-face "Vazirmatn"` — one variable WOFF2, `wght 100 900`, so every weight
  the UI asks for resolves without extra requests;
- overrides `--font-sans` and `--default-font-family` on `:root`, `html` and
  `body` with `!important`, because ZCode's theme layer may inject a
  same-specificity `:root{--font-sans:…}` at runtime;
- sets the family on `html`, `body` and the form controls, since Chromium never
  makes form controls inherit `font-family`;
- **leaves `--font-mono` alone** — code must keep its monospaced metrics.

`runtime/rtl.css` also mirrors the physical properties the app uses for Persian
lists, quotes and tables, and sets `text-align: right` / right-edge caret on
`[dir="rtl"]` blocks and fields.

## Verified behaviour

`build/rtl-harness.html` (generated from the real payload by
`tools/make-harness.mjs`) asserts 13 behaviours; the notable ones:

| case | result |
| --- | --- |
| `این یک پاسخ کاملاً فارسی است.` | `dir=rtl`, `text-align: right` |
| `API docs: این روش کار می‌کند.` | `dir=rtl` (English-first still flips) |
| `This paragraph is entirely English.` | no `dir` (stays LTR) |
| `const greeting = "سلام";` inside `pre > code` | `code` tagged force-ltr, `pre` `direction: ltr` |
| `textarea` with a Persian placeholder | `dir=rtl` before typing |
| `textarea` typed with `سلام دنیا` | `dir=rtl` on `input` |
| streamed Persian appended to a block | `dir=rtl` after one frame |
| `getComputedStyle(body).fontFamily` | `Vazirmatn`, and it loads |
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

/* ============================================================
   Freebuff Desktop — per-block text direction (RTL patch helper)
   Rule (final, per user):
     - Chat/prose blocks: any block containing ANY Persian/Arabic char
       => dir="rtl" (readable right-to-left), even if it starts with
       English words like "WiGate: از نظر فنی ...". Pure-English => ltr.
     - Opened FILE editor (CodeMirror `.cm-line`):
         * DOCUMENTATION / text files (markdown, plain text, rst, ...)
           follow the same rule (any Persian => dir=rtl).
         * CODE files ALWAYS stay LTR — never RTL (critical).
       Detected via the editor's `.cm-content[data-language]`.
     - Code / terminal blocks are excluded and always stay LTR.
    A MutationObserver + periodic scan keep dir correct for streaming text,
    newly-added messages and virtualized editor lines.
    V3 (0.0.146+): composer contentEditable + .user-message-text covered;
    ZWNJ-aware regex; .md-pre/.md-inline forced LTR.
    V4: multiple-choice questions (.question-*) + agent to-do list
    (.todo-dock-text) covered; inputs read .value (not textContent).
    V5: GENERIC fallback layer. The UI grows dozens of new text-bearing
    classes per release (1318 distinct classes in 0.0.169), so a fixed
    selector list can never keep up. scanGeneric() walks TEXT NODES and
    flags the element that directly owns Persian text, anywhere in the app,
    as long as it is not inside code / terminal / editor / a layout-only
    container. Explicit SEL blocks are still handled first.
    ============================================================ */
(function () {
  'use strict'

  // Persian + Arabic + Arabic supplements + presentation forms + RTL marks.
  // V3: also ZWNJ/ZWJ (U+200C/U+200D, needed for Persian), LRM/RLM and
  // embeddings (U+202A-U+202E).
  var RTL_RE = /[\u0591-\u07FF\u08A0-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC\u200C-\u200F\u202A-\u202E]/

  // Languages whose files may be rendered RTL (documentation / text).
  // Everything else (code) is forced LTR. Names come from CodeMirror's
  // `data-language` attribute on `.cm-content`.
  var DOCS_LANG =
    /markdown|mdx|mdown|markdn|restructured|\brst\b|asciidoc|\badoc\b|textile|orgmode|\borg\b|latex|\btex\b|bibtex|typst|\btext\b|plain|\blog\b/i

  // Leaf text blocks that carry user-visible prose.
  // (Note: `.prose div` is deliberately NOT included — it would also catch the
  // code-block wrapper `.md-code` and flip code that contains Persian.)
  // V3 (0.0.146+): composer input is now a contentEditable div
  // ([data-composer-input].composer-input) as well as the legacy textarea;
  // user bubbles expose .user-message-text inside .bubble.
  var SEL =
    '.prose p, .prose li, .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6,' +
    '.prose blockquote, .prose td, .prose th,' +
    '.bubble, .user-message-text, .message-text, .message-bubble,' +
    '.tool-row-details,' +
    '.composer textarea, .composer [data-composer-input], .composer-input,' +
    '.question-text, .question-option-body, .question-option-label,' +
    '.question-option-desc, .question-plan, .question-free,' +
    '.todo-dock-text,' +
    '.cm-line'

  // Blocks that must ALWAYS stay LTR (code, terminal, code-block wrapper).
  var LTR_SEL = 'pre, code, kbd, samp, .xterm, .md-code, .md-pre, .md-inline'

  // Is this CodeMirror line inside a documentation/text editor?
  function editorIsDocs(line) {
    var ed = line.closest ? line.closest('.cm-editor') : null
    if (!ed) return false
    var content = ed.querySelector ? ed.querySelector('.cm-content') : null
    var lang = content && content.getAttribute
      ? (content.getAttribute('data-language') || '')
      : ''
    return DOCS_LANG.test(lang)
  }

  // Walk up from any node to the nearest block that we manage (or el itself).
  function nearestBlock(el) {
    var n = el
    while (n && n.nodeType === 1) {
      if (n.matches && n.matches(SEL)) return n
      n = n.parentElement
    }
    return null
  }

  // Form fields (textarea / text input) expose the typed value via .value,
  // not textContent — read .value there (V4: .question-free free-answer input).
  function blockText(block) {
    if (!block) return ''
    var tag = block.tagName
    if ((tag === 'TEXTAREA' || (tag === 'INPUT' && block.type === 'text')) &&
        typeof block.value === 'string') return block.value
    return block.textContent || ''
  }

  // --- V5 generic layer ------------------------------------------------------
  // Never touch anything inside these: code, terminal, editor, or anything
  // the app itself marks as its own LTR island.
  var NEVER_SEL =
    'pre, code, kbd, samp, textarea, .xterm, .terminal-panel, .terminal-stage,' +
    ' .terminal-session-surface, .terminal-context-output, .cm-editor,' +
    ' .cm-content, .md-code, .md-pre, .md-inline, .diff-plain-patch,' +
    ' .diff-view-body, .diffs-container, [data-fbf-lock], .sr-only,' +
    ' script, style, svg, path, [aria-hidden="true"]'

  // Layout-only wrappers: their `dir` would reorder flex/grid children
  // (chevrons, checkboxes, buttons jumping to the wrong side). Text inside
  // them is still flagged because we walk down to the text's own element.
  var LAYOUT_SEL =
    'button, a, label, summary, details, .btn, .tab, [role="button"],' +
    ' [role="tab"], [role="menuitem"], [role="option"], [role="switch"],' +
    ' [role="checkbox"], [role="radio"], [data-composer-input]'

  function isNeverRTL(el) {
    try { return !!(el.closest && el.closest(NEVER_SEL)) } catch (e) { return true }
  }

  // Flag the element that directly contains this Persian text node.
  function flagTextNode(node) {
    var owner = node.parentElement
    if (!owner) return
    if (owner.matches && owner.matches(NEVER_SEL)) return
    // Explicit blocks keep their own (broader) handling in apply().
    if (owner.matches && owner.matches(SEL)) return
    if (isNeverRTL(owner)) return
    // Skip pure layout wrappers so the row order never flips.
    if (owner.matches && owner.matches(LAYOUT_SEL)) return
    if (owner.getAttribute('dir') === 'rtl') return
    owner.setAttribute('dir', 'rtl')
    owner.setAttribute('data-fbf-rtl', '1')
  }

  function scanGeneric(root) {
    var scope = root && root.nodeType === 1 ? root : document.body
    if (!scope) return
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null)
    var node
    while ((node = walker.nextNode())) {
      if (node.nodeValue && RTL_RE.test(node.nodeValue)) flagTextNode(node)
    }
  }

  function apply(el) {
    var block = el && el.matches && el.matches(SEL) ? el : nearestBlock(el)
    if (!block) return
    if (block.matches && block.matches(LTR_SEL)) return

    var txt = blockText(block)
    var isEditorLine = block.classList && block.classList.contains('cm-line')
    var dir

    if (isEditorLine) {
      // Opened files: only documentation/text files may be RTL; code stays LTR.
      dir = editorIsDocs(block) && RTL_RE.test(txt) ? 'rtl' : 'ltr'
    } else {
      dir = RTL_RE.test(txt) ? 'rtl' : 'ltr'
    }

    if (block.getAttribute('dir') !== dir) block.setAttribute('dir', dir)
  }

  function handleAddedNode(n) {
    if (n.nodeType === 3) {
      // textContent swap / stream chunk replaces the text node -> re-eval its block
      apply(n.parentElement)
      return
    }
    if (n.nodeType !== 1) return
    if (n.matches && n.matches(SEL)) apply(n)
    var inside = n.querySelectorAll ? n.querySelectorAll(SEL) : []
    for (var i = 0; i < inside.length; i++) apply(inside[i])
    if (n.matches && !n.matches(SEL)) apply(nearestBlock(n))
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i]
      if (m.type === 'characterData') {
        apply(m.target.parentElement || m.target)
        if (m.target.nodeValue && RTL_RE.test(m.target.nodeValue)) flagTextNode(m.target)
        continue
      }
      for (var j = 0; j < m.addedNodes.length; j++) {
        handleAddedNode(m.addedNodes[j])
        scanGeneric(m.addedNodes[j])
      }
    }
  })

  // textarea / contentEditable input is not DOM characterData, so hook it
  // directly. V3: the composer is now a contentEditable div
  // ([data-composer-input].composer-input), not just a textarea.
  document.addEventListener('input', function (e) {
    var t = e.target
    if (!t || !t.tagName) return
    if (t.tagName === 'TEXTAREA') { apply(t); return }
    // V4: free-text question answers are <input type="text"> (.question-free).
    if (t.tagName === 'INPUT' && t.type === 'text') { apply(t); return }
    if (t.hasAttribute && (t.hasAttribute('data-composer-input') ||
        (t.classList && t.classList.contains('composer-input')))) apply(t)
  })

  function scanAll() {
    var nodes = document.querySelectorAll(SEL)
    for (var i = 0; i < nodes.length; i++) apply(nodes[i])
    // V5: catch every Persian text node, including the classes that did not
    // exist when this patch was written.
    scanGeneric(document.body)
  }

  function boot() {
    scanAll()
    mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    // Safety net: a missed observer event can never leave a Persian block stuck
    // at dir=ltr (e.g. mid-stream text swaps, editor line virtualization).
    setInterval(scanAll, 1000)
    // Late mounts (dev overlays, lazily-loaded panels) may arrive after boot.
    window.addEventListener('load', scanAll)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
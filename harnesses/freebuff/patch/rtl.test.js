#!/usr/bin/env node
/* DOM-level regression tests for patch/rtl.js.
 *
 * Why this exists: rtl.js has grown four generations of logic (explicit
 * selector list + questions/to-do list + the V5 generic text-node layer).
 * Counting grep hits cannot prove the exclusion rules still hold — a single
 * misplaced `dir` on a flex row silently moves a checkbox to the wrong side,
 * and an over-broad generic rule silently RTL-flips a code block. These tests
 * mount the real rtl.js in a DOM and assert the outcome per surface.
 *
 * Run:  node patch/rtl.test.js
 * Needs jsdom (a dev-only dependency, resolved from wherever it is installed):
 *   npm i -D jsdom   # or rely on a parent-directory node_modules
 * Exits 0 with a SKIP notice (not a silent pass) when jsdom is unavailable.
 */
'use strict'

const fs = require('fs')
const path = require('path')

let JSDOM
try {
  JSDOM = require('jsdom').JSDOM
} catch (e) {
  console.log('SKIP: jsdom not installed — run `npm i -D jsdom` to run these tests.')
  process.exit(0)
}

const RTL_JS = path.join(__dirname, 'rtl.js')
const RTL_SRC = fs.readFileSync(RTL_JS, 'utf8')

/* Fixtures mirror the real class names taken from the Freebuff bundle. The
 * CodeMirror cases keep the full `.cm-editor > .cm-content[data-language]`
 * nesting, because rtl.js reads the language off `.cm-content` via
 * `closest('.cm-editor')` — a missing wrapper silently degrades to LTR. */
const FIXTURE = `<!doctype html><html><body>
<div class="prose">
  <p>این یک پاراگراف فارسی است</p>
  <p>English paragraph stays LTR</p>
</div>

<div class="question-dock-body"><div class="question">
  <div class="question-head">
    <span class="question-chip">مهم</span>
    <span class="question-text">کدام گزینه بهتر است؟</span>
  </div>
  <div class="question-options">
    <button class="question-option"><span class="question-option-body"><span class="question-option-label">گزینه اول</span></span></button>
    <button class="question-option"><span class="question-option-body"><span class="question-option-label">Option two</span></span></button>
  </div>
</div></div>

<ul class="todo-dock-list">
  <li class="todo-dock-item pending"><span class="todo-dock-mark"></span><span class="todo-dock-text">فایل جدید بساز</span></li>
  <li class="todo-dock-item done"><span class="todo-dock-mark"></span><span class="todo-dock-text">Done item in English</span></li>
</ul>

<pre class="md-pre"><code>const x = 1; // کامنت فارسی نباید RTL شود</code></pre>
<div class="xterm">terminal output with فارسی</div>
<div class="diff-plain-patch">--- a/x
+++ b/x
// کامنت فارسی در diff</div>

<div class="cm-editor"><div class="cm-content" data-language="javascript"><div class="cm-line">const y = "کد فارسی";</div></div></div>
<div class="cm-editor"><div class="cm-content" data-language="markdown"><div class="cm-line"># عنوان فارسی</div><div class="cm-line">English heading</div></div></div>

<div class="reasoning-text">تفکر مدل درباره مسأله</div>
<div class="onboarding-prompt-question">چه چیزی می‌خواهی؟</div>
<div class="proposal-headline">پیشنهاد ویژه برای شما</div>
<div class="sidebar-thread-title">گفتگوی فارسی جدید</div>
<div class="tool-row-details">خروجی ابزار با متن فارسی</div>

<button class="btn chip">یک دکمه فارسی</button>
<div class="composer"><div class="composer-input" contenteditable="true">سلام، چطوری؟</div></div>
<input class="question-free" type="text" value="پاسخ فارسی من">
<div class="sr-only">متن پنهان فارسی</div>
</body></html>`

/* Each case: [selector, expected dir]. '' means the attribute must be ABSENT —
 * that is how we assert "this must never be flagged", not merely "not rtl". */
const CASES = [
  // Chat prose
  ['.prose p', 'rtl'],
  ['.prose p:nth-of-type(2)', 'ltr'],

  // Multiple-choice questions: text flips, flex rows must not
  ['.question-text', 'rtl'],
  ['.question-chip', 'rtl'],
  ['.question-option-label', 'rtl'],
  ['.question-option:nth-child(2) .question-option-label', 'ltr'],
  ['.question-option', ''],

  // Agent to-do list
  ['.todo-dock-item:nth-child(1) .todo-dock-text', 'rtl'],
  ['.todo-dock-item:nth-child(2) .todo-dock-text', 'ltr'],
  ['.todo-dock-item', ''],

  // Code / terminal / diffs NEVER flip
  ['.md-pre', ''],
  ['.md-pre code', ''],
  ['.xterm', ''],
  ['.diff-plain-patch', ''],

  // Editor: code file stays LTR, docs file follows the Persian rule
  ['.cm-content[data-language="javascript"] .cm-line', 'ltr'],
  ['.cm-content[data-language="markdown"] .cm-line:nth-child(1)', 'rtl'],
  ['.cm-content[data-language="markdown"] .cm-line:nth-child(2)', 'ltr'],

  // Surfaces added after the explicit selector list was written — these must
  // pass via the V5 generic layer, with no selector upkeep.
  ['.reasoning-text', 'rtl'],
  ['.onboarding-prompt-question', 'rtl'],
  ['.proposal-headline', 'rtl'],
  ['.sidebar-thread-title', 'rtl'],
  ['.tool-row-details', 'rtl'],

  // Buttons/inputs: composer + free-text answers flip; layout buttons do not
  ['.btn.chip', ''],
  ['.composer-input', 'rtl'],
  ['.question-free', 'rtl'],

  // Screen-reader-only text must stay untouched
  ['.sr-only', ''],
]

const dom = new JSDOM(FIXTURE, { runScripts: 'outside-only' })
dom.window.eval(RTL_SRC)

// rtl.js installs a 1s interval plus a MutationObserver; give both a chance to
// run before asserting so the result matches steady state, not first paint.
setTimeout(() => {
  const doc = dom.window.document
  let pass = 0
  const failures = []

  for (const [sel, expected] of CASES) {
    const el = doc.querySelector(sel)
    if (!el) {
      failures.push([sel, 'ELEMENT MISSING', expected])
      continue
    }
    const got = el.getAttribute('dir') || '<unset>'
    const want = expected === '' ? '<unset>' : expected
    if (got === want) pass++
    else failures.push([sel, got, want])
  }

  for (const [sel, got, want] of failures) {
    console.error(`FAIL ${sel}\n     got=${got} want=${want}`)
  }

  const flagged = doc.querySelectorAll('[data-fbf-rtl]').length
  console.log(`rtl.test.js: ${pass}/${CASES.length} passed; ` +
    `${flagged} generic flags set`)
  dom.window.close()
  process.exit(failures.length === 0 ? 0 : 1)
}, 400)

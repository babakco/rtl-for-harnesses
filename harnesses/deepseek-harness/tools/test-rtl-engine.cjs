/*
 * Contract test for the dsh-rtl.js direction engine.
 *
 * The user's requirement, verbatim in intent: a sentence/paragraph must be
 * RTL if it contains at least one Persian character ANYWHERE, even when it
 * begins with English letters or punctuation. This test encodes exactly that
 * and also pins the always-LTR exclusions.
 *
 * Run: node tools/test-rtl-engine.cjs
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  process.stderr.write(
    'jsdom is required for the test suite.\n' +
      '  install it with:  npm install\n' +
      '  (the patch itself does NOT need jsdom; only this test does)\n'
  );
  process.exit(2);
}

const ENGINE = path.join(__dirname, '..', 'payload', 'dsh-rtl.js');

/* [name, html, expected dir of the target element, selector] */
const CASES = [
  [
    'pure Persian',
    '<div id="t">سلام دنیا</div>',
    'rtl',
  ],
  [
    'English first, Persian later (the core requirement)',
    '<div id="t">Hello world, this is متن فارسی inside</div>',
    'rtl',
  ],
  [
    'starts with punctuation and digits',
    '<div id="t">123. ) ( ، متن فارسی</div>',
    'rtl',
  ],
  [
    'starts with an English word then a Persian word',
    '<div id="t">API docs این روش کار می‌کند</div>',
    'rtl',
  ],
  [
    'Persian ZWNJ joined word',
    '<div id="t">می‌رود</div>',
    'rtl',
  ],
  [
    'English only is left with no dir attribute at all',
    '<div id="t">Hello world, no Persian here</div>',
    'none',
  ],
  [
    'single Latin letter is left with no dir attribute',
    '<div id="t">A</div>',
    'none',
  ],
  [
    'Persian digits count as script',
    '<div id="t">total ۱۲۳ done</div>',
    'rtl',
  ],
  [
    'paragraphs are independent: one RTL, one LTR',
    '<section><p id="a">این فارسی است</p><p id="b">this is english only</p></section>',
    'mixed',
  ],
  [
    'code block with Persian is never marked rtl by the engine',
    '<div id="t">متن فارسی<pre>const x = "سلام";</pre></div>',
    'rtl',
    '#t pre',
    'none',
  ],
  [
    'inline code with Persian is never marked rtl by the engine',
    '<div id="t">متن فارسی <code>let s = "سلام"</code></div>',
    'rtl',
    '#t code',
    'none',
  ],
  [
    'an author-written dir is respected, not overwritten',
    '<div id="t">متن فارسی<pre dir="auto">const x = 1;</pre></div>',
    'rtl',
    '#t pre',
    'auto',
  ],
  [
    'list items each judged on their own',
    '<ul><li id="a">فارسی</li><li id="b">english</li></ul>',
    'mixed',
  ],
  [
    'xterm terminal row stays LTR',
    '<div id="t">خروجی<pre class="xterm-rows">total ۵</pre></div>',
    'rtl',
    '#t .xterm-rows',
    'none',
  ],
];

let failures = 0;

const UNSET = '(unset)';

function dirOf(doc, selector) {
  const el = doc.querySelector(selector);
  if (!el) return '(missing)';
  const value = el.getAttribute('dir');
  return value === null ? UNSET : value;
}

for (const [name, html, expected, targetSel, expectedDir] of CASES) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  window.eval(fs.readFileSync(ENGINE, 'utf8'));
  /* let the DOMContentLoaded/start path settle */
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  let ok;
  if (expected === 'mixed') {
    const a = dirOf(window.document, '#a');
    const b = dirOf(window.document, '#b');
    ok = a === 'rtl' && b === UNSET;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${name}  (#a=${a}, #b=${b})`
    );
  } else {
    const got = dirOf(window.document, targetSel || '#t');
    const want0 = expectedDir || expected;
    const want = want0 === 'none' ? UNSET : want0;
    ok = got === want;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got=${got}, want=${want})`);
  }
  dom.window.close();
}

/* textarea caret direction */
{
  const dom = new JSDOM(
    '<!doctype html><html><body><textarea id="c"></textarea></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const { window } = dom;
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  window.eval(fs.readFileSync(ENGINE, 'utf8'));
  const ta = window.document.getElementById('c');
  ta.value = 'این یک تست است';
  ta.dispatchEvent(new window.Event('input', { bubbles: true }));
  const got = ta.getAttribute('dir') || UNSET;
  const ok = got === 'rtl';
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  textarea with Persian value is RTL  (got=${got})`);
  dom.window.close();
}

/* ------------------------------------------------------------------ */
/* streaming: an assistant message is filled token by token, and the  */
/* block must flip to RTL the moment Persian arrives.                  */
/* ------------------------------------------------------------------ */
async function testStreaming() {
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="bubble"><p id="t"></p></div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const { window } = dom;
  const raf = [];
  window.requestAnimationFrame = (fn) => { raf.push(fn); return raf.length; };
  window.eval(fs.readFileSync(ENGINE, 'utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  const p = window.document.getElementById('t');

  /* MutationObserver delivers on a microtask, then the engine batches into
     requestAnimationFrame. A real browser has the same two-step ordering. */
  const emit = async (text) => {
    if (p.firstChild) p.firstChild.nodeValue = text;
    else p.appendChild(window.document.createTextNode(text));
    await new Promise((resolve) => window.queueMicrotask(resolve));
    raf.splice(0).forEach((fn) => fn());
  };

  const steps = [
    ['Here is the', null, 'LTR while only English has arrived'],
    ['Here is the plan for', null, 'still LTR, still English'],
    ['Here is the plan for \u0627\u06CC\u0646', 'rtl', 'RTL as soon as one Persian char lands'],
    ['Here is the plan for \u0627\u06CC\u0646 \u0637\u0631\u062D', 'rtl', 'stays RTL as more Persian arrives'],
    ['Back to English only', null, 'reverts when the Persian is removed'],
  ];

  for (const [text, want, label] of steps) {
    await emit(text);
    const got = p.getAttribute('dir');
    const ok = got === want;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  streaming: ${label}  (dir=${got}, want=${want})`);
  }
  dom.window.close();
}

testStreaming().then(() => {
  console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
});

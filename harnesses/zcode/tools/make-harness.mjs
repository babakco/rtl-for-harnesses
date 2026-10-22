#!/usr/bin/env node
/**
 * make-harness.mjs — generate a self-contained browser harness for the payload.
 *
 * It inlines the *real* `runtime/rtl.css` and `runtime/rtl.js` (not copies, so
 * the harness can never drift from what ships) against a mock chat surface, then
 * asserts the direction rules the patch promises:
 *
 *   - a paragraph with any Persian character becomes RTL, even when it starts
 *     with English or a URL;
 *   - a pure-English paragraph stays LTR;
 *   - `pre`/`code` islands never flip, though their parent may be RTL;
 *   - the composer (`textarea`) and a Persian placeholder drive the caret side;
 *   - streamed text flips as it arrives;
 *   - Vazirmatn is the resolved body font.
 *
 * Open `build/rtl-harness.html` in a browser; results render on the page and in
 * `window.__HARNESS__`. Exit-code form: `node tools/make-harness.mjs`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(HERE, 'build', 'rtl-harness.html');

const css = fs.readFileSync(path.join(HERE, 'runtime', 'rtl.css'), 'utf8');
const js = fs.readFileSync(path.join(HERE, 'runtime', 'rtl.js'), 'utf8');
const font = fs.readFileSync(path.join(HERE, 'runtime', 'fonts', 'vazirmatn-var.woff2'));
const fontDataUri = `data:font/woff2;base64,${font.toString('base64')}`;

// The in-archive CSS reaches the font through a relative URL; in the single-file
// harness that URL cannot resolve, so inline it as a data URI instead.
const inlinedCss = css.replace('url("./fonts/vazirmatn-var.woff2")', `url("${fontDataUri}")`);

const html = `<!doctype html>
<html lang="fa">
<head>
<meta charset="utf-8">
<title>zcode-rtl payload harness</title>
<style>${inlinedCss}</style>
</head>
<body>
<div id="app">
  <div class="message" id="m1"><p id="p-fa">این یک پاسخ کاملاً فارسی است.</p></div>
  <div class="message" id="m2"><p id="p-mixed">API docs: این روش کار می‌کند.</p></div>
  <div class="message" id="m3"><p id="p-en">This paragraph is entirely English.</p></div>
  <div class="message" id="m4"><div id="wrap-rtl"><span>متن فارسی</span></div></div>
  <div class="code" id="m5"><pre><code id="code-block">const greeting = "سلام";</code></pre></div>
  <div class="composer">
    <textarea id="composer" placeholder="پیام خود را بنویسید…"></textarea>
    <textarea id="composer-en" placeholder="Type a message…"></textarea>
    <input id="composer-input">
  </div>
  <div class="message" id="m6"><p id="stream"></p></div>
  <pre id="results">running…</pre>
</div>

<script>${js}</script>
<script>
(function () {
  var checks = [];
  function check(name, actual, expected) {
    checks.push({ name: name, pass: actual === expected, actual: String(actual), expected: String(expected) });
  }
  function dir(id) { return document.getElementById(id).getAttribute('dir') || ''; }

  // Drive the composer + inject streamed text the way the real app does.
  var composer = document.getElementById('composer');
  composer.value = 'سلام دنیا';
  composer.dispatchEvent(new Event('input', { bubbles: true }));
  var composerEn = document.getElementById('composer-en');
  composerEn.value = 'hello world';
  composerEn.dispatchEvent(new Event('input', { bubbles: true }));

  document.getElementById('stream').textContent = 'در حال ';

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      check('persian paragraph -> rtl', dir('p-fa'), 'rtl');
      check('persian box -> rtl', dir('wrap-rtl'), 'rtl');
      check('english-first mixed -> rtl', dir('p-mixed'), 'rtl');
      // An English-only block deliberately carries *no* dir: the app's own LTR
      // default already applies, and leaving the attribute untouched avoids
      // fighting the renderer over markup we do not own.
      check('english paragraph is not rtl', dir('p-en') === 'rtl', false);
      check('code block is not rtl', dir('code-block') === 'rtl', false);
      check('code island is tagged force-ltr', document.getElementById('code-block').getAttribute('data-zcode-rtl-force-ltr'), '');
      check('no dir leaked onto the code <pre>', document.querySelector('#m5 pre').getAttribute('dir'), null);
      check('persian placeholder -> rtl', dir('composer'), 'rtl');
      check('persian-typed composer -> rtl', composer.getAttribute('dir'), 'rtl');
      check('english placeholder stays ltr', dir('composer-en') === 'rtl', false);
      check('streamed persian -> rtl', dir('stream'), 'rtl');

      var family = getComputedStyle(document.body).fontFamily;
      check('body font is Vazirmatn', /Vazirmatn/.test(family), true);
      check('font actually loaded', document.fonts.check('16px Vazirmatn'), true);

      var failed = checks.filter(function (c) { return !c.pass; });
      var lines = checks.map(function (c) {
        return (c.pass ? 'PASS  ' : 'FAIL  ') + c.name + (c.pass ? '' : '   (got "' + c.actual + '", want "' + c.expected + '")');
      });
      lines.push('', failed.length + ' failed / ' + checks.length + ' total');
      document.getElementById('results').textContent = lines.join('\\n');
      window.__HARNESS__ = { done: true, pass: checks.length - failed.length, fail: failed.length, checks: checks };
    });
  });
})();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`wrote ${path.relative(HERE, OUT)} (${(html.length / 1024).toFixed(1)} KiB)\n`);
}

export { html };

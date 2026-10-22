import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCss, fontFaceBlock } from '../tools/build-css.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('fontFaceBlock renders one weight with a data uri', () => {
  const block = fontFaceBlock(400, 'QUJD');
  assert.ok(block.includes('@font-face'), 'must contain @font-face');
  assert.ok(block.includes('font-weight: 400'), 'must contain font-weight: 400');
  assert.ok(block.includes('data:font/woff2;base64,QUJD'), 'must embed the given base64');
  assert.ok(block.includes("format('woff2')"), 'must declare woff2 format');
});

test('buildCss embeds all three weights as data uris', () => {
  const out = path.join(tmpdir(), 'codex-rtl-test-' + process.pid + '.css');
  const css = buildCss(path.join(root, 'fonts'), out);
  assert.equal(count(css, 'font-weight: 400'), 1);
  assert.equal(count(css, 'font-weight: 500'), 1);
  assert.equal(count(css, 'font-weight: 700'), 1);
  assert.equal(count(css, 'data:font/woff2;base64,'), 3);
  assert.equal(readFileSync(out, 'utf8'), css);
});

test('buildCss output carries rtl direction and control exclusions', () => {
  const out = path.join(tmpdir(), 'codex-rtl-scope-' + process.pid + '.css');
  const css = buildCss(path.join(root, 'fonts'), out);
  assert.ok(!css.includes('unicode-bidi: plaintext'), 'must not contain unicode-bidi: plaintext (it forces Latin-first paragraphs LTR)');
  assert.ok(css.includes('[dir="rtl"]{direction:rtl;text-align:right;}'), 'must force direction and alignment on [dir=rtl]');
  assert.ok(css.includes('button'), 'must exclude button controls');
  assert.ok(css.includes('[role=button]'), 'must exclude [role=button]');
  assert.ok(css.includes('direction:ltr'), 'must force code blocks ltr');
});

test('monospace override is the last font rule', () => {
  const out = path.join(tmpdir(), 'codex-rtl-order-' + process.pid + '.css');
  const css = buildCss(path.join(root, 'fonts'), out);
  assert.ok(css.includes('ui-monospace'), 'must contain a ui-monospace rule');
  assert.ok(css.indexOf('ui-monospace') > css.lastIndexOf('Vazirmatn'), 'ui-monospace must come after Vazirmatn');
});

test('committed payload css exists with three embedded fonts', () => {
  const css = readFileSync(path.join(root, 'payload/codex-rtl.css'), 'utf8');
  assert.equal(count(css, 'data:font/woff2;base64,'), 3);
  assert.ok(css.includes('ui-monospace'), 'committed css must contain the monospace override');
  const out = path.join(tmpdir(), 'codex-rtl-committed-' + process.pid + '.css');
  const fresh = buildCss(path.join(root, 'fonts'), out);
  assert.equal(css, fresh, 'committed css must be byte-identical to generator output');
});

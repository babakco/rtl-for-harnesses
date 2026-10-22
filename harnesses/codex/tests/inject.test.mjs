import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectHtml, stripMarkers, hasMarkers } from '../tools/inject.mjs';

const START = '<!--CODEX-RTL:START-->';
const END = '<!--CODEX-RTL:END-->';
const SCRIPT_TAG = '<script type="module" src="./assets/codex-rtl.js"></script>';
const LINK_TAG = '<link rel="stylesheet" href="./assets/codex-rtl.css">';

const realIndex = readFileSync(new URL('./fixtures/index.html', import.meta.url), 'utf8');
const realDetached = readFileSync(new URL('./fixtures/detached-window.html', import.meta.url), 'utf8');

const synthetic = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>hi</p></body></html>';

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function checkInjectContract(html, label) {
  assert.equal(hasMarkers(html), false, label + ': pristine html has no markers');
  assert.equal(stripMarkers(html), html, label + ': strip on pristine html is identity');
  const once = injectHtml(html, { force: false });
  assert.equal(count(once, START), 1, label + ': exactly one START after inject');
  assert.equal(count(once, END), 1, label + ': exactly one END after inject');
  assert.ok(once.includes(SCRIPT_TAG), label + ': exact script tag present');
  assert.ok(once.includes(LINK_TAG), label + ': exact link tag present');
  assert.ok(once.indexOf(START) < once.lastIndexOf('</head>'), label + ': block sits before </head>');
  const twice = injectHtml(once, { force: false });
  assert.equal(twice, once, label + ': second inject without force is idempotent');
  const tampered = once.replace('./assets/codex-rtl.js', './assets/tampered.js');
  assert.ok(!tampered.includes(SCRIPT_TAG), label + ': tamper setup removed the script tag');
  const forced = injectHtml(tampered, { force: true });
  assert.equal(count(forced, START), 1, label + ': force rebuilds exactly one region');
  assert.equal(count(forced, END), 1, label + ': force rebuilds exactly one END');
  assert.ok(forced.includes(SCRIPT_TAG), label + ': force restores the script tag');
  assert.ok(forced.includes(LINK_TAG), label + ': force restores the link tag');
  assert.ok(!forced.includes('tampered.js'), label + ': force drops the tampered tag');
  assert.equal(hasMarkers(stripMarkers(forced)), false, label + ': stripped output has no markers');
}

test('synthetic html follows the inject contract', () => {
  checkInjectContract(synthetic, 'synthetic');
});

test('real index.html follows the inject contract', () => {
  assert.equal(Buffer.byteLength(realIndex, 'utf8'), 14803, 'fixture size must be 14803 bytes');
  checkInjectContract(realIndex, 'index.html');
});

test('real detached-window.html follows the inject contract', () => {
  assert.equal(Buffer.byteLength(realDetached, 'utf8'), 2847, 'fixture size must be 2847 bytes');
  checkInjectContract(realDetached, 'detached-window.html');
});

test('inject without a head tag leaves html unchanged', () => {
  const bare = '<p>no head here</p>';
  assert.equal(injectHtml(bare, { force: false }), bare);
  assert.equal(injectHtml(bare, { force: true }), bare);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRTLChar, hasRTL, detectDir } from '../payload/rtl-detect.mjs';

test('simple Persian sentence is rtl', () => {
  assert.equal(detectDir('سلام دنیا'), 'rtl');
  assert.equal(hasRTL('سلام دنیا'), true);
});

test('pure English sentence stays ltr', () => {
  assert.equal(detectDir('Hello world, no Persian here'), 'ltr');
  assert.equal(hasRTL('Hello world, no Persian here'), false);
});

test('mixed Latin and Persian sentence is rtl', () => {
  assert.equal(detectDir('see the docs فارسی خوب است'), 'rtl');
  assert.equal(hasRTL('see the docs فارسی خوب است'), true);
});

test('line starting with Latin tag is rtl when Persian follows', () => {
  assert.equal(detectDir('[fa] فارسی'), 'rtl');
});

test('line starting with quote or bracket is rtl when Persian follows', () => {
  assert.equal(detectDir('"سلام"'), 'rtl');
  assert.equal(detectDir('(سلام)'), 'rtl');
});

test('Hebrew word is rtl', () => {
  assert.equal(detectDir('שלום'), 'rtl');
  assert.equal(hasRTLChar('ש'), true);
});

test('Arabic presentation forms are rtl', () => {
  assert.equal(detectDir('ﻓﺎﺭﺳﯽ'), 'rtl');
  assert.equal(hasRTLChar('ﻑ'), true);
});

test('range boundaries are inclusive', () => {
  assert.equal(hasRTLChar('֐'), true);
  assert.equal(hasRTLChar('־'), true);
  assert.equal(hasRTLChar('؀'), true);
  assert.equal(hasRTLChar('ۿ'), true);
});

test('extended Arabic ranges count as rtl', () => {
  assert.equal(hasRTLChar('ݩ'), true);
  assert.equal(hasRTLChar('ࢡ'), true);
  assert.equal(hasRTLChar('ﹰ'), true);
});

test('ZWNJ U+200C counts as rtl', () => {
  assert.equal(hasRTLChar('\u200C'), true);
  assert.equal(hasRTL('\u200C'), true);
  assert.equal(detectDir('\u200C'), 'rtl');
});

test('Persian word with ZWNJ is rtl', () => {
  assert.equal(detectDir('می‌رود'), 'rtl');
  assert.equal(hasRTL('می‌رود'), true);
});

test('empty string is ltr', () => {
  assert.equal(hasRTL(''), false);
  assert.equal(detectDir(''), 'ltr');
});

test('pure emoji string is ltr', () => {
  assert.equal(hasRTL('🎉🚀'), false);
  assert.equal(detectDir('🎉🚀'), 'ltr');
});

test('Latin letters digits and spaces are not rtl chars', () => {
  assert.equal(hasRTLChar('A'), false);
  assert.equal(hasRTLChar('z'), false);
  assert.equal(hasRTLChar('1'), false);
  assert.equal(hasRTLChar(' '), false);
});

test('Persian word inside English punctuation is rtl', () => {
  assert.equal(detectDir('Hello, سلام!'), 'rtl');
});

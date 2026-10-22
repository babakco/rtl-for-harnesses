import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPayload } from '../tools/build-payload.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function buildToTemp(name) {
  const out = path.join(tmpdir(), name + '-' + process.pid + '.js');
  const result = buildPayload(
    path.join(root, 'payload/rtl-detect.mjs'),
    path.join(root, 'payload/rtl-dom.js'),
    out
  );
  assert.equal(result, undefined, 'buildPayload must return void');
  return out;
}

test('assembled payload carries the exec marker and both fragments', () => {
  const out = buildToTemp('codex-rtl-asm');
  const js = readFileSync(out, 'utf8');
  assert.ok(js.includes('document.documentElement.dataset.codexRtl = "1"'), 'must set the exec marker first');
  assert.ok(js.includes('MutationObserver'), 'must contain the observer loop');
  assert.ok(js.includes('hasRTL'), 'must contain hasRTL');
  assert.ok(js.includes('detectDir'), 'must contain detectDir');
  assert.ok(js.includes('isExcluded'), 'must contain isExcluded');
  assert.ok(js.includes('codexRtl'), 'must contain codexRtl');
  assert.ok(js.includes("'use strict'"), 'must be a strict IIFE');
  assert.ok(!/^\s*import[\s(]/m.test(js), 'must not contain import statements');
  assert.ok(!/^\s*export\s/m.test(js), 'must not contain export statements');
});

test('assembled payload passes node syntax check', () => {
  const out = buildToTemp('codex-rtl-check');
  const run = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, 'node --check must exit 0, got: ' + run.stderr);
});

test('committed payload js exists with the exec marker', () => {
  const js = readFileSync(path.join(root, 'payload/codex-rtl.js'), 'utf8');
  assert.ok(js.includes('codexRtl'), 'committed payload must contain codexRtl');
  assert.ok(js.includes('MutationObserver'), 'committed payload must contain the observer loop');
  const out = buildToTemp('codex-rtl-committed');
  const fresh = readFileSync(out, 'utf8');
  assert.equal(js, fresh, 'committed js must be byte-identical to generator output');
});

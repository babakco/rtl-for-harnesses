import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPT = readFileSync(path.join(REPO_ROOT, 'patch-codex-rtl.sh'), 'utf8');

function doMakeRtlBody() {
  const start = SCRIPT.indexOf('do_make_rtl()');
  assert.notEqual(start, -1);
  const end = SCRIPT.indexOf('\ndo_status()', start);
  assert.notEqual(end, -1);
  return SCRIPT.slice(start, end);
}

test('marker is written before codesign so it is sealed into the signature', () => {
  const body = doMakeRtlBody();
  const markerWrite = body.indexOf('> "$DEST/$MARKER"');
  assert.notEqual(markerWrite, -1);
  const sign = body.indexOf('codesign --force');
  assert.notEqual(sign, -1);
  assert.ok(markerWrite < sign, 'marker write must precede codesign invocation');
});

test('codesign keeps the hardened runtime flag', () => {
  const body = doMakeRtlBody();
  assert.match(body, /codesign --force --deep --options runtime --sign -/);
});

test('codesign verify runs after signing as the final gate', () => {
  const body = doMakeRtlBody();
  const sign = body.indexOf('codesign --force');
  const verify = body.indexOf('codesign --verify --deep --strict');
  assert.notEqual(sign, -1);
  assert.notEqual(verify, -1);
  assert.ok(verify > sign, 'verify must run after signing');
});

test('marker path has a single definition and lives inside the sealed bundle', () => {
  const defs = SCRIPT.split('\n').filter((l) => l.startsWith('MARKER='));
  assert.equal(defs.length, 1);
  assert.match(defs[0], /MARKER="Contents\/\.codex-rtl-patch\.json"/);
  const hardcoded = SCRIPT.split('\n').filter((l) => l.includes('.codex-rtl-patch.json') && !l.includes('$MARKER') && !l.includes('LEGACY_MARKER') && !l.startsWith('MARKER='));
  assert.deepEqual(hardcoded, []);
});

test('dry-run plan orders marker before sign with runtime flag', () => {
  const res = spawnSync('./patch-codex-rtl.sh', ['--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, RTL_APP_DEST: path.join(os.tmpdir(), 'codex-rtl-signorder-probe.app') }
  });
  assert.equal(res.status, 0);
  const writeIdx = res.stdout.indexOf('would write:');
  const signIdx = res.stdout.indexOf('codesign --force');
  assert.notEqual(writeIdx, -1);
  assert.notEqual(signIdx, -1);
  assert.ok(writeIdx < signIdx, 'dry-run must list marker write before codesign');
  assert.match(res.stdout, /--options runtime/);
});

test('framework slot patch runs between plist hash update and marker write', () => {
  const body = doMakeRtlBody();
  const plist = body.indexOf('update_plist_hash');
  const slot = body.indexOf('patch_framework_slot');
  const markerWrite = body.indexOf('> "$DEST/$MARKER"');
  const headerHash = body.indexOf('asar_header_hash');
  assert.notEqual(plist, -1);
  assert.notEqual(slot, -1);
  assert.notEqual(markerWrite, -1);
  assert.notEqual(headerHash, -1);
  assert.ok(headerHash < plist, 'header hash must precede plist update');
  assert.ok(plist < slot, 'slot patch must run after plist update');
  assert.ok(slot < markerWrite, 'slot patch must precede marker write');
});

test('entitlement preparation uses prepareEntitlements with runtime hardening', () => {
  assert.match(SCRIPT, /prepareEntitlements/);
  const body = doMakeRtlBody();
  assert.match(body, /codesign --force --deep --options runtime --sign -/);
});

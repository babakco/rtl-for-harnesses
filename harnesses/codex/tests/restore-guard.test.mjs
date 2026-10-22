import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, readlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = '/Applications/ChatGPT.app';
const LINK_PATH = '/Applications/ChatGPT RTL.app';
const REAL_DEST = path.join(os.homedir(), 'Applications', 'ChatGPT-RTL.app');

function linkState() {
  try {
    return { exists: true, target: readlinkSync(LINK_PATH) };
  } catch {
    return { exists: false, target: null };
  }
}

test('restore refuses source bundle dest without deleting anything', () => {
  const srcExisted = existsSync(SRC);
  const linkBefore = linkState();
  const res = spawnSync('./patch-codex-rtl.sh', ['--restore'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, RTL_APP_DEST: SRC }
  });
  assert.notEqual(res.status, 0, 'restore with source DEST must fail');
  const out = (res.stdout || '') + (res.stderr || '');
  assert.match(out, /refusing unsafe dest/, 'must refuse via unsafe-dest guard');
  assert.match(out, /restore:/, 'refusal must carry restore prefix');
  assert.equal(existsSync(SRC), srcExisted, 'source bundle must be untouched');
  assert.deepEqual(linkState(), linkBefore, 'symlink must be untouched on refusal');
});

test('restore proceeds for marked RTL copy under temp HOME/Applications dir', () => {
  const homeApps = path.join(os.homedir(), 'Applications');
  mkdirSync(homeApps, { recursive: true });
  const dest = mkdtempSync(path.join(homeApps, 'codex-rtl-restore-test-'));
  assert.notEqual(dest, REAL_DEST, 'must not use the real dest');
  const realExistedBefore = existsSync(REAL_DEST);
  const linkBefore = linkState();
  try {
    mkdirSync(path.join(dest, 'Contents'), { recursive: true });
    writeFileSync(path.join(dest, 'Contents', '.codex-rtl-patch.json'), '{"test":true}\n');
    const res = spawnSync('./patch-codex-rtl.sh', ['--restore'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, RTL_APP_DEST: dest }
    });
    assert.equal(res.status, 0, 'normal restore must succeed, got: ' + (res.stdout || '') + (res.stderr || ''));
    assert.equal(existsSync(dest), false, 'temp dest must be removed');
    assert.equal(existsSync(REAL_DEST), realExistedBefore, 'real dest must be untouched');
    assert.deepEqual(linkState(), linkBefore, 'symlink must be untouched (temp dest)');
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

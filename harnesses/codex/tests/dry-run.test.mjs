import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LINK_PATH = '/Applications/ChatGPT RTL.app';
const PROBE_DEST = path.join(os.tmpdir(), 'codex-rtl-dryrun-probe.app');

function appsListing() {
  return readdirSync('/Applications').slice().sort();
}

function linkState() {
  try {
    return { exists: true, target: readlinkSync(LINK_PATH) };
  } catch {
    return { exists: false, target: null };
  }
}

function porcelain() {
  const res = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0);
  return res.stdout;
}

test('dry-run exits 0, prints plan, and writes nothing', () => {
  if (existsSync(PROBE_DEST)) {
    rmSync(PROBE_DEST, { recursive: true, force: true });
  }
  const appsBefore = appsListing();
  const linkBefore = linkState();
  const gitBefore = porcelain();
  const res = spawnSync('./patch-codex-rtl.sh', ['--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, RTL_APP_DEST: PROBE_DEST }
  });
  assert.equal(res.error, undefined);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /preflight/);
  assert.match(res.stdout, /--make-rtl/);
  assert.equal(existsSync(PROBE_DEST), false);
  assert.deepEqual(appsListing(), appsBefore);
  assert.deepEqual(linkState(), linkBefore);
  assert.equal(porcelain(), gitBefore);
  if (existsSync(PROBE_DEST)) {
    rmSync(PROBE_DEST, { recursive: true, force: true });
  }
});

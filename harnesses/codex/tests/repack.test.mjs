import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_DIFFERENCES, deriveUnpackGlobs, verifyRepackInvariant } from '../tools/repack.mjs';
import { injectHtml, injectionByteLength } from '../tools/inject.mjs';

const UNPACKED_ROOT = '/stash/ChatGPT-RTL.app/Contents/Resources/app.asar.unpacked';
const INJECTED_SET = new Set(ALLOWED_DIFFERENCES.injectedHtml);
const INDEX_PATH = ALLOWED_DIFFERENCES.injectedHtml[0];
const DETACHED_PATH = ALLOWED_DIFFERENCES.injectedHtml[1];
const RTL_JS = ALLOWED_DIFFERENCES.addedAssets.find((p) => p.endsWith('.js'));
const RTL_CSS = ALLOWED_DIFFERENCES.addedAssets.find((p) => p.endsWith('.css'));

const PRISTINE = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>hi</p></body></html>';
const VALID_INJECTED = injectHtml(PRISTINE, { force: true });
const DELTA = injectionByteLength();

function entry(path, size, unpacked, content) {
  const e = { path, size, unpacked };
  if (content !== undefined) {
    e.content = content;
  }
  return e;
}

function baseListing() {
  return [
    entry('/.vite/build/app.js', 1200, false),
    entry(INDEX_PATH, 14803, false),
    entry(DETACHED_PATH, 2847, false),
    entry('/node_modules/better-sqlite3/build/Release/x.node', 900, true)
  ];
}

function withRtlAssets(listing) {
  const out = listing.map((e) => {
    if (INJECTED_SET.has(e.path)) {
      return entry(e.path, e.size + DELTA, e.unpacked, VALID_INJECTED);
    }
    return entry(e.path, e.size, e.unpacked);
  });
  return out.concat([
    entry(RTL_CSS, 204880, false),
    entry(RTL_JS, 4829, false)
  ]);
}

test('deriveUnpackGlobs maps unpacked files to sorted deduped globs', () => {
  const files = [
    UNPACKED_ROOT + '/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    UNPACKED_ROOT + '/node_modules/node-pty/build/Release/pty.node',
    UNPACKED_ROOT + '/node_modules/objc-js/prebuilds/a.node',
    UNPACKED_ROOT + '/node_modules/@worklouder/device-kit-oai/prebuilds/b.node',
    UNPACKED_ROOT + '/node_modules/better-sqlite3/build/Release/other.node'
  ];
  assert.deepEqual(deriveUnpackGlobs(files), [
    'node_modules/@worklouder/device-kit-oai/prebuilds/b.node',
    'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    'node_modules/better-sqlite3/build/Release/other.node',
    'node_modules/node-pty/build/Release/pty.node',
    'node_modules/objc-js/prebuilds/a.node'
  ]);
});

test('deriveUnpackGlobs ignores paths outside the unpacked dir', () => {
  assert.deepEqual(deriveUnpackGlobs(['/elsewhere/node_modules/foo/bar.node']), []);
  assert.deepEqual(deriveUnpackGlobs([]), []);
});

test('verifyRepackInvariant accepts exactly the two new rtl assets', () => {
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(withRtlAssets(baseListing())));
  assert.equal(res.ok, true);
  assert.equal(typeof res.reason, 'string');
});

test('verifyRepackInvariant rejects a changed file size', () => {
  const tampered = withRtlAssets(baseListing());
  tampered[0] = entry('/.vite/build/app.js', 1201, false);
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(tampered));
  assert.equal(res.ok, false);
  assert.match(res.reason, /size changed/);
});

test('verifyRepackInvariant rejects a flipped unpacked flag', () => {
  const tampered = withRtlAssets(baseListing());
  tampered[3] = entry('/node_modules/better-sqlite3/build/Release/x.node', 900, false);
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(tampered));
  assert.equal(res.ok, false);
  assert.match(res.reason, /unpacked flag changed/);
});

test('verifyRepackInvariant rejects a removed path and an unexpected added path', () => {
  const removed = withRtlAssets(baseListing()).filter((e) => e.path !== INDEX_PATH);
  const resRemoved = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(removed));
  assert.equal(resRemoved.ok, false);
  assert.match(resRemoved.reason, /missing path/);
  const extra = withRtlAssets(baseListing()).concat([entry('/webview/assets/extra.js', 10, false)]);
  const resExtra = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(extra));
  assert.equal(resExtra.ok, false);
  assert.match(resExtra.reason, /unexpected added paths/);
});

test('injected html files may grow by exactly the injector delta', () => {
  assert.equal(DELTA, Buffer.byteLength(VALID_INJECTED, 'utf8') - Buffer.byteLength(PRISTINE, 'utf8'));
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(withRtlAssets(baseListing())));
  assert.equal(res.ok, true);
});

test('injected html shrink is rejected', () => {
  const shrunk = withRtlAssets(baseListing()).map((e) => {
    if (e.path === INDEX_PATH) {
      return entry(e.path, 14803 - 1, false, VALID_INJECTED);
    }
    return e;
  });
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(shrunk));
  assert.equal(res.ok, false);
  assert.match(res.reason, /did not grow|shrink|smaller|greater|injection/i);
});

test('third file growth is rejected when injected files are valid', () => {
  const tampered = withRtlAssets(baseListing()).map((e) => {
    if (e.path === '/node_modules/better-sqlite3/build/Release/x.node') {
      return entry(e.path, e.size + 1, true);
    }
    return e;
  });
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(tampered));
  assert.equal(res.ok, false);
  assert.match(res.reason, /x\.node/);
});

test('missing codex-rtl js asset is rejected', () => {
  const missing = withRtlAssets(baseListing()).filter((e) => e.path !== RTL_JS);
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(missing));
  assert.equal(res.ok, false);
  assert.match(res.reason, /missing.*codex-rtl\.js|codex-rtl\.js/i);
});

test('injected html without markers is rejected', () => {
  const badContent = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>hi</p></body></html>';
  const mangled = withRtlAssets(baseListing()).map((e) => {
    if (e.path === INDEX_PATH) {
      return entry(e.path, e.size, e.unpacked, badContent);
    }
    return e;
  });
  const res = verifyRepackInvariant(JSON.stringify(baseListing()), JSON.stringify(mangled));
  assert.equal(res.ok, false);
  assert.match(res.reason, /marker|CODEX-RTL/i);
});

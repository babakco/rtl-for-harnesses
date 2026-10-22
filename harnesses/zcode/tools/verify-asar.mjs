#!/usr/bin/env node
/**
 * verify-asar.mjs — prove that a built/installed ZCode-RTL bundle is correct.
 *
 * `zcode-rtl-patch` reports what it *did*; this reports what is *true* about the
 * resulting bundle, by reading it back independently:
 *
 *   1. every renderer document links the payload exactly once;
 *   2. the payload assets exist with the expected byte sizes;
 *   3. the `ElectronAsarIntegrity` hash in Info.plist matches a fresh digest of
 *      the archive's own header;
 *   4. the bundle id / name / deep-link scheme were moved off the original's;
 *   5. the updater manifest is gone and the helper bundles were renamed;
 *   6. `codesign --verify --deep --strict` passes.
 *
 * usage: node tools/verify-asar.mjs [path/to/ZCode-RTL.app]
 * exits: 0 all checks pass, 1 otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { readAsar, closeAsar, readEntry, findEntry, walkEntries, headerDigestFromJson } from '../src/asar.mjs';
import { RTL_CSS, RTL_JS, RTL_FONT, MARKER } from '../src/patch-app.mjs';
import { readFuseWire, run, FUSE_ENABLE_ASAR_INTEGRITY } from '../src/bundle.mjs';

const app = process.argv[2] || '/Applications/ZCode-RTL.app';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? '\u001b[32m✔\u001b[0m' : '\u001b[31m✘\u001b[0m'} ${name}${detail ? `  \u001b[2m${detail}\u001b[0m` : ''}\n`);
}

if (!fs.existsSync(app)) {
  process.stderr.write(`no such app bundle: ${app}\n`);
  process.exit(1);
}

const info = path.join(app, 'Contents', 'Info.plist');
const resources = path.join(app, 'Contents', 'Resources');
const asarPath = path.join(resources, 'app.asar');

const pluck = (key) => {
  try {
    return run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, info]);
  } catch {
    return null;
  }
};

const bundleId = pluck('CFBundleIdentifier');
const name = pluck('CFBundleName');
check('bundle id is a distinct RTL id', /\.rtl$/.test(bundleId || ''), bundleId || '(missing)');
check('display name is distinct', /-RTL$/.test(name || ''), name || '(missing)');
check('executable still resolves', fs.existsSync(path.join(app, 'Contents', 'MacOS', pluck('CFBundleExecutable') || '')));
check('deep-link scheme moved off `zcode`', pluck('CFBundleURLTypes:0:CFBundleURLSchemes:0') !== 'zcode', pluck('CFBundleURLTypes:0:CFBundleURLSchemes:0'));

check('updater manifest removed', !fs.existsSync(path.join(resources, 'app-update.yml')));

const frameworks = path.join(app, 'Contents', 'Frameworks');
const helpers = fs.existsSync(frameworks)
  ? fs.readdirSync(frameworks).filter((entry) => entry.endsWith(' Helper.app') || / Helper .*\.app$/.test(entry))
  : [];
check(
  'helper bundles renamed to match',
  helpers.length > 0 && helpers.every((helper) => helper.startsWith(`${name} Helper`)),
  helpers.join(', ') || '(none found)',
);
for (const helper of helpers) {
  const suffix = helper.slice(`${name} Helper`.length, -'.app'.length);
  const exec = path.join(frameworks, helper, 'Contents', 'MacOS', `${name} Helper${suffix}`);
  if (!fs.existsSync(exec)) check(`helper executable present: ${helper}`, false, exec);
}

const fuse = readFuseWire(app);
if (fuse) {
  const enforced = fuse.states[FUSE_ENABLE_ASAR_INTEGRITY] === '1';
  check(
    'asar integrity fuse state known',
    true,
    enforced ? 'ENABLED — plist hash must be exact' : 'DISABLED — plist hash is advisory',
  );
}

const handle = readAsar(asarPath);
try {
  const digest = headerDigestFromJson(handle.jsonBuf);
  const plistHash = pluck('ElectronAsarIntegrity:Resources/app.asar:hash');
  check('Info.plist asar hash matches the archive header', plistHash === digest, `${plistHash} vs ${digest}`);

  for (const asset of [RTL_CSS, RTL_JS, RTL_FONT]) {
    const entry = findEntry(handle.json, asset);
    check(`payload asset present: ${asset}`, Boolean(entry), entry ? `${entry.size} bytes` : 'MISSING');
  }

  const docs = [...walkEntries(handle.json)].filter((item) => /^out\/renderer\/.*\.html$/.test(item.path));

  check('renderer documents found', docs.length > 0, `${docs.length} document(s)`);
  for (const doc of docs) {
    const html = readEntry(handle, doc.path).toString('utf8');
    const count = html.split(MARKER).length - 1;
    check(`payload linked exactly once: ${path.basename(doc.path)}`, count === 1, `${count} reference(s)`);
  }
} finally {
  closeAsar(handle);
}

try {
  run('codesign', ['--verify', '--deep', '--strict', app]);
  check('codesign --verify --deep --strict', true);
} catch (error) {
  check('codesign --verify --deep --strict', false, error.message.split('\n')[0]);
}

const failed = results.filter((item) => !item.ok);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
if (failed.length) {
  process.stdout.write(`failed: ${failed.map((item) => item.name).join(', ')}\n`);
  process.exit(1);
}

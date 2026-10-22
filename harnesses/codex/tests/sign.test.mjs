import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { stripEntitlements, prepareEntitlements, asarHeaderHash, updateAsarHash, asarIntegrityDigest, patchFrameworkIntegritySlot, ASAR_INTEGRITY_SENTINEL } from '../tools/sign.mjs';

const SAMPLE_ENTITLEMENTS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0">',
  '<dict>',
  '  <key>com.apple.application-identifier</key>',
  '  <string>2DC432GLL2.com.openai.codex</string>',
  '  <key>com.apple.developer.team-identifier</key>',
  '  <string>2DC432GLL2</string>',
  '  <key>keychain-access-groups</key>',
  '  <array>',
  '    <string>2DC432GLL2.*</string>',
  '    <string>2DC432GLL2.com.openai.shared</string>',
  '  </array>',
  '  <key>com.apple.security.app-sandbox</key>',
  '  <false/>',
  '  <key>com.apple.developer.aps-environment</key>',
  '  <string>production</string>',
  '  <key>com.apple.developer.usernotifications.communication</key>',
  '  <true/>',
  '  <key>com.apple.security.cs.allow-jit</key>',
  '  <true/>',
  '  <key>com.apple.security.device.audio-input</key>',
  '  <true/>',
  '</dict>',
  '</plist>',
  ''
].join('\n');

const OLD_HASH = 'b0d442ed63026a266e9f86df139bcafb9dcafe628b7065ea0473fe82760a82f0';
const NEW_HASH = '40efd7acdf03a24817fcd7f35684fc2173b154df06774243cb4ab227e36fa915';

const SAMPLE_PLIST = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<plist version="1.0">',
  '<dict>',
  '  <key>CFBundleIdentifier</key>',
  '  <string>com.openai.codex</string>',
  '  <key>SomeOther</key>',
  '  <dict>',
  '    <key>hash</key>',
  '    <string>DECOY</string>',
  '  </dict>',
  '  <key>ElectronAsarIntegrity</key>',
  '  <dict>',
  '    <key>Resources/app.asar</key>',
  '    <dict>',
  '      <key>algorithm</key>',
  '      <string>SHA256</string>',
  '      <key>hash</key>',
  '      <string>' + OLD_HASH + '</string>',
  '    </dict>',
  '  </dict>',
  '</dict>',
  '</plist>',
  ''
].join('\n');

test('stripEntitlements removes exactly the four signer-bound keys with their values', () => {
  const stripped = stripEntitlements(SAMPLE_ENTITLEMENTS);
  assert.equal(stripped.includes('com.apple.application-identifier'), false);
  assert.equal(stripped.includes('com.apple.developer.team-identifier'), false);
  assert.equal(stripped.includes('keychain-access-groups'), false);
  assert.equal(stripped.includes('com.apple.developer.aps-environment'), false);
  assert.equal(stripped.includes('com.apple.developer.usernotifications.communication'), false);
  assert.equal(stripped.includes('2DC432GLL2'), false);
});

test('stripEntitlements preserves jit sandbox and hardening keys', () => {
  const stripped = stripEntitlements(SAMPLE_ENTITLEMENTS);
  assert.equal(stripped.includes('allow-jit'), true);
  assert.equal(stripped.includes('com.apple.security.cs.allow-jit'), true);
  assert.equal(stripped.includes('app-sandbox'), true);
  assert.equal(stripped.includes('com.apple.security.device.audio-input'), true);
});

test('stripEntitlements handles single-line codesign xml output', () => {
  const singleLine = SAMPLE_ENTITLEMENTS.split('\n').join('');
  const stripped = stripEntitlements(singleLine);
  assert.equal(stripped.includes('com.apple.application-identifier'), false);
  assert.equal(stripped.includes('com.apple.developer.team-identifier'), false);
  assert.equal(stripped.includes('keychain-access-groups'), false);
  assert.equal(stripped.includes('2DC432GLL2'), false);
  assert.equal(stripped.includes('allow-jit'), true);
  assert.equal(stripped.includes('aps-environment'), false);
  assert.equal(stripped.includes('app-sandbox'), true);
});

test('updateAsarHash replaces only the asar integrity hash', () => {
  const updated = updateAsarHash(SAMPLE_PLIST, NEW_HASH);
  assert.equal(updated.includes(NEW_HASH), true);
  assert.equal(updated.includes(OLD_HASH), false);
  assert.equal(updated.includes('com.openai.codex'), true);
  assert.equal(updated.includes('SHA256'), true);
  assert.equal(updated.includes('DECOY'), true);
});

const FULL_ENTITLEMENTS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<plist version="1.0">',
  '<dict>',
  '  <key>com.apple.application-identifier</key>',
  '  <string>2DC432GLL2.com.openai.codex</string>',
  '  <key>com.apple.developer.aps-environment</key>',
  '  <string>production</string>',
  '  <key>com.apple.developer.usernotifications.communication</key>',
  '  <true/>',
  '  <key>com.apple.developer.team-identifier</key>',
  '  <string>2DC432GLL2</string>',
  '  <key>com.apple.security.app-sandbox</key>',
  '  <false/>',
  '  <key>com.apple.security.application-groups</key>',
  '  <array>',
  '    <string>2DC432GLL2.com.openai.codex.notifications</string>',
  '  </array>',
  '  <key>com.apple.security.automation.apple-events</key>',
  '  <true/>',
  '  <key>com.apple.security.cs.allow-jit</key>',
  '  <true/>',
  '  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>',
  '  <true/>',
  '  <key>com.apple.security.device.audio-input</key>',
  '  <true/>',
  '  <key>com.apple.security.device.camera</key>',
  '  <true/>',
  '  <key>com.apple.security.files.user-selected.read-write</key>',
  '  <true/>',
  '  <key>com.apple.security.network.client</key>',
  '  <true/>',
  '  <key>com.apple.security.personal-information.calendars</key>',
  '  <true/>',
  '  <key>keychain-access-groups</key>',
  '  <array>',
  '    <string>2DC432GLL2.*</string>',
  '  </array>',
  '</dict>',
  '</plist>',
  ''
].join('\n');

test('prepareEntitlements strips exactly the five provisioned-only keys', () => {
  const out = prepareEntitlements(FULL_ENTITLEMENTS);
  assert.equal(out.includes('com.apple.application-identifier'), false);
  assert.equal(out.includes('com.apple.developer.team-identifier'), false);
  assert.equal(out.includes('keychain-access-groups'), false);
  assert.equal(out.includes('com.apple.developer.aps-environment'), false);
  assert.equal(out.includes('com.apple.developer.usernotifications.communication'), false);
  assert.equal(out.includes('<string>2DC432GLL2</string>'), false);
  assert.equal(out.includes('<string>2DC432GLL2.*</string>'), false);
  assert.equal(out.includes('<string>production</string>'), false);
});

test('prepareEntitlements keeps every com.apple.security hardening key by name', () => {
  const out = prepareEntitlements(FULL_ENTITLEMENTS);
  assert.equal(out.includes('com.apple.security.app-sandbox'), true);
  assert.equal(out.includes('com.apple.security.application-groups'), true);
  assert.equal(out.includes('com.apple.security.automation.apple-events'), true);
  assert.equal(out.includes('com.apple.security.cs.allow-jit'), true);
  assert.equal(out.includes('com.apple.security.cs.allow-unsigned-executable-memory'), true);
  assert.equal(out.includes('com.apple.security.device.audio-input'), true);
  assert.equal(out.includes('com.apple.security.device.camera'), true);
  assert.equal(out.includes('com.apple.security.files.user-selected.read-write'), true);
  assert.equal(out.includes('com.apple.security.network.client'), true);
  assert.equal(out.includes('com.apple.security.personal-information.calendars'), true);
});

test('prepareEntitlements adds disable-library-validation once', () => {
  const once = prepareEntitlements(FULL_ENTITLEMENTS);
  assert.equal(once.includes('com.apple.security.cs.disable-library-validation'), true);
  const twice = prepareEntitlements(once);
  assert.equal(twice, once);
});

function writeFakeAsar(dir, headerObj) {
  const header = Buffer.from(JSON.stringify(headerObj), 'utf8');
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(4, 4);
  prefix.writeUInt32LE(4, 8);
  prefix.writeUInt32LE(header.length, 12);
  const p = join(dir, 'fake.asar');
  writeFileSync(p, Buffer.concat([prefix, header, Buffer.from('payload-bytes')]));
  return { path: p, expected: createHash('sha256').update(header).digest('hex') };
}

test('asarHeaderHash hashes exactly the header bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-rtl-asarhash-'));
  try {
    const { path, expected } = writeFakeAsar(dir, { files: { 'a.txt': { size: 3 } } });
    assert.equal(asarHeaderHash(path), expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('asarHeaderHash rejects truncated input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-rtl-asarhash-'));
  try {
    const p = join(dir, 'tiny.asar');
    writeFileSync(p, Buffer.alloc(10));
    assert.throws(() => asarHeaderHash(p));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('asarIntegrityDigest reproduces the original framework slot digest', () => {
  const origHeader = 'b0d442ed63026a266e9f86df139bcafb9dcafe628b7065ea0473fe82760a82f0';
  const expected = '985010f76c1f11f504f767370698a3c506777d45d421f121b83f24dbcf840460';
  assert.equal(asarIntegrityDigest(origHeader), expected);
});

function writeFakeFramework(dir, oldDigestHex) {
  const prefix = Buffer.from('fake-prefix-bytes-0123456789');
  const suffix = Buffer.from('fake-suffix-bytes-9876543210');
  const sentinel = Buffer.from(ASAR_INTEGRITY_SENTINEL, 'utf8');
  const flags = Buffer.from([1, 1]);
  const slot = Buffer.from(oldDigestHex, 'hex');
  const p = join(dir, 'fake-framework');
  writeFileSync(p, Buffer.concat([prefix, sentinel, flags, slot, suffix]));
  return { path: p, prefixLen: prefix.length, sentinelLen: sentinel.length };
}

test('patchFrameworkIntegritySlot replaces exactly the old digest with the new one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-rtl-slot-'));
  try {
    const oldHeader = 'b0d442ed63026a266e9f86df139bcafb9dcafe628b7065ea0473fe82760a82f0';
    const newHeader = 'fbbf5cd979c7be60198b917a859fb33233deff81e8c1335ff43df1b8859b544f';
    const oldHex = asarIntegrityDigest(oldHeader);
    const newHex = asarIntegrityDigest(newHeader);
    const { path } = writeFakeFramework(dir, oldHex);
    const before = readFileSync(path);
    const res = patchFrameworkIntegritySlot(path, oldHeader, newHeader);
    assert.equal(res.oldDigestHex, oldHex);
    assert.equal(res.newDigestHex, newHex);
    const after = readFileSync(path);
    assert.equal(after.length, before.length);
    assert.equal(after.indexOf(Buffer.from(oldHex, 'hex')), -1);
    const hits = [];
    let from = 0;
    const want = Buffer.from(newHex, 'hex');
    for (;;) {
      const idx = after.indexOf(want, from);
      if (idx === -1) {
        break;
      }
      hits.push(idx);
      from = idx + 1;
    }
    assert.equal(hits.length, 1);
    assert.equal(hits[0], res.offset);
    const maskOld = Buffer.from(before);
    maskOld.fill(0, res.offset, res.offset + 32);
    const maskNew = Buffer.from(after);
    maskNew.fill(0, res.offset, res.offset + 32);
    assert.deepEqual(maskNew, maskOld);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patchFrameworkIntegritySlot fails loudly when the old digest is absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-rtl-slot-'));
  try {
    const oldHeader = 'b0d442ed63026a266e9f86df139bcafb9dcafe628b7065ea0473fe82760a82f0';
    const newHeader = 'fbbf5cd979c7be60198b917a859fb33233deff81e8c1335ff43df1b8859b544f';
    const otherHex = asarIntegrityDigest('0000000000000000000000000000000000000000000000000000000000000000');
    const { path } = writeFakeFramework(dir, otherHex);
    assert.throws(() => patchFrameworkIntegritySlot(path, oldHeader, newHeader), /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

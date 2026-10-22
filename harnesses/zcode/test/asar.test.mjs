import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  align4,
  closeAsar,
  computeIntegrity,
  findEntry,
  headerDigestFromJson,
  readAsar,
  readEntry,
  rewriteAsar,
  sha256,
  walkEntries,
} from '../src/asar.mjs';
import { injectHead, planEdits, relaxCsp, RTL_CSS, RTL_JS, RTL_FONT } from '../src/patch-app.mjs';

const JSON_START = 16;

/**
 * Minimal, byte-exact asar writer for fixtures: a real header pickle followed by
 * the data section, so the reader exercises the same offsets a real archive has.
 */
function buildAsar(entries) {
  const files = {};
  const data = [];
  let cursor = 0;
  for (const [rel, content] of Object.entries(entries)) {
    const buf = Buffer.from(content);
    let node = files;
    const parts = rel.split('/');
    for (const part of parts.slice(0, -1)) {
      node[part] = node[part] || { files: {} };
      node = node[part].files;
    }
    node[parts.at(-1)] = {
      size: buf.length,
      offset: String(cursor),
      integrity: computeIntegrity(buf),
    };
    cursor += buf.length;
    data.push(buf);
  }

  const json = Buffer.from(JSON.stringify({ files }), 'utf8');
  const padded = json.length + align4(json.length);
  const payloadSize = 4 + padded;
  const headerBufLen = 4 + payloadSize;
  const head = Buffer.alloc(JSON_START + padded);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(headerBufLen, 4);
  head.writeUInt32LE(payloadSize, 8);
  head.writeUInt32LE(json.length, 12);
  json.copy(head, JSON_START);
  return { buffer: Buffer.concat([head, ...data]), dataStart: JSON_START + padded, jsonBuf: json };
}

function tmpAsar(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcode-asar-'));
  const file = path.join(dir, 'app.asar');
  const { buffer } = buildAsar(entries);
  fs.writeFileSync(file, buffer);
  return file;
}

const DOC = (link) => `<!doctype html><html><head><meta charset="utf-8">${
  link ? `<link rel="stylesheet" href="${link}">` : ''
}</head><body><div id="root"></div></body></html>`;

test('align4 rounds up to the next 4-byte boundary', () => {
  assert.equal(align4(0), 0);
  assert.equal(align4(1), 3);
  assert.equal(align4(4), 0);
  assert.equal(align4(7087290), 2);
});

test('reader parses a well-formed archive and walks its tree', () => {
  const file = tmpAsar({ 'out/renderer/index.html': DOC(), 'package.json': '{"name":"z"}' });
  const handle = readAsar(file);
  try {
    const paths = [...walkEntries(handle.json)].map((item) => item.path).sort();
    assert.deepEqual(paths, ['out/renderer/index.html', 'package.json']);
    assert.equal(readEntry(handle, 'package.json').toString(), '{"name":"z"}');
    assert.equal(
      readEntry(handle, 'out/renderer/index.html').length,
      Buffer.byteLength(DOC()),
    );
    assert.ok(findEntry(handle.json, 'out/renderer')?.files);
  } finally {
    closeAsar(handle);
  }
});

test('header digest is sha256 of the unpadded header JSON', () => {
  const file = tmpAsar({ 'a.txt': 'a' });
  const handle = readAsar(file);
  try {
    assert.equal(headerDigestFromJson(handle.jsonBuf), sha256(handle.jsonBuf));
  } finally {
    closeAsar(handle);
  }
});

test('rewriteAsar appends without disturbing existing entries', async () => {
  const file = tmpAsar({ 'out/renderer/index.html': DOC(), 'keep.txt': 'keep-me' });
  const before = readAsar(file);
  const firstBytes = readEntry(before, 'keep.txt').toString();
  closeAsar(before);

  const result = await rewriteAsar(file, {
    replace: new Map([['out/renderer/index.html', Buffer.from(DOC('zcode-rtl.css'))]]),
    add: new Map([['out/renderer/zcode-rtl.css', Buffer.from('body{}')]]),
  });
  assert.equal(result.replaced, 1);
  assert.equal(result.added, 1);
  assert.ok(result.bytesOut > result.bytesIn);

  const after = readAsar(file);
  try {
    assert.equal(readEntry(after, 'keep.txt').toString(), firstBytes);
    assert.match(readEntry(after, 'out/renderer/index.html').toString(), /zcode-rtl\.css/);
    assert.equal(readEntry(after, 'out/renderer/zcode-rtl.css').toString(), 'body{}');
    const entry = findEntry(after.json, 'out/renderer/zcode-rtl.css');
    assert.equal(entry.integrity.algorithm, 'SHA256');
    assert.equal(Number(entry.offset) >= before.dataSize, true);
  } finally {
    closeAsar(after);
  }
});

test('rewriteAsar refuses to replace a missing entry', async () => {
  const file = tmpAsar({ 'a.txt': 'a' });
  await assert.rejects(
    () => rewriteAsar(file, { replace: new Map([['nope.txt', Buffer.from('x')]]) }),
    /missing entry/,
  );
});

test('injectHead inserts once and is idempotent', () => {
  const html = '<html><head><title>t</title></head><body></body></html>';
  const first = injectHead(html, '<link rel="stylesheet" href="zcode-rtl.css">\n');
  assert.equal(first.changed, true);
  assert.match(first.html, /zcode-rtl\.css">\s*<\/head>/);
  const second = injectHead(first.html, '<link rel="stylesheet" href="zcode-rtl.css">\n');
  assert.equal(second.changed, false);
  assert.equal(second.html, first.html);
  assert.throws(() => injectHead('<html></html>', 'x'), /no <\/head>/);
});

test('relaxCsp widens a restrictive policy and leaves a permissive one alone', () => {
  const strict =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'">';
  const relaxed = relaxCsp(strict);
  assert.match(relaxed, /default-src 'none' 'self'/);
  assert.match(relaxed, /script-src 'unsafe-inline' 'self'/);

  const permissive = '<meta http-equiv="Content-Security-Policy" content="script-src \'self\'">';
  assert.equal(relaxCsp(permissive), permissive);

  assert.equal(relaxCsp('<head><title>no policy</title></head>'), '<head><title>no policy</title></head>');
});

test('planEdits injects every renderer document and adds the payload', async () => {
  const file = tmpAsar({
    'out/renderer/index.html': DOC(),
    'out/renderer/cua-permission-panel.html': DOC(),
    'out/renderer/assets/app.js': 'console.log(1)',
    'package.json': '{"name":"z"}',
  });
  const payload = {
    css: Buffer.from('/* css */'),
    js: Buffer.from('/* js */'),
    font: Buffer.from('font-bytes'),
  };

  const handle = readAsar(file);
  let plan;
  try {
    plan = planEdits(handle, payload);
  } finally {
    closeAsar(handle);
  }

  assert.deepEqual(plan.changed, [
    'out/renderer/cua-permission-panel.html',
    'out/renderer/index.html',
  ]);
  const injected = plan.replace.get('out/renderer/index.html').toString();
  assert.match(injected, /href="\.\/zcode-rtl\.css"/);
  assert.match(injected, /src="\.\/zcode-rtl\.js" defer/);
  assert.equal(plan.add.get(RTL_CSS).toString(), '/* css */');
  assert.equal(plan.add.get(RTL_JS).toString(), '/* js */');
  assert.equal(plan.add.get(RTL_FONT).toString(), 'font-bytes');
  assert.equal(plan.replace.has('package.json'), false);
  assert.equal(plan.replace.has('out/renderer/assets/app.js'), false);
});

test('planEdits is idempotent and rewrites rather than re-adds the payload', () => {
  // An already-injected document must not be injected a second time, but the
  // payload assets must still be refreshed (so a UI-only change re-deploys).
  const already = injectHead(DOC(), '  <link rel="stylesheet" href="./zcode-rtl.css">\n').html;
  const file = tmpAsar({ 'out/renderer/index.html': already });
  const handle = readAsar(file);
  try {
    const second = planEdits(handle, {
      css: Buffer.from('/* v2 */'),
      js: Buffer.from('/* v2 */'),
      font: Buffer.from('f'),
    });
    assert.deepEqual(second.changed, []);
    assert.deepEqual(second.unchanged, ['out/renderer/index.html']);
    assert.equal(second.add.get(RTL_CSS).toString(), '/* v2 */');
  } finally {
    closeAsar(handle);
  }
});

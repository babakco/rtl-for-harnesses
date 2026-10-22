#!/usr/bin/env node
'use strict';
/* ============================================================================
 * inject-asar.js — surgical patcher for WorkBuddy AI app.asar (no full unpack)
 * v1.4.0: patches TWO html shells with the RTL payload —
 *   renderer/index.html (main window) and
 *   renderer/markdown-shared-guest.html (opened-file markdown preview iframe,
 *   served over http as static-html; cross-origin so the main-window observer
 *   can never reach it — the payload must run in its own document).
 * Adds renderer/assets/workbuddy-rtl.css and renderer/assets/workbuddy-rtl.js,
 * supporting BOTH packed and unpacked entries (5.7.x ships index.html packed;
 * 5.8.x ships everything unpacked on disk).
 *
 * - Packed files are rewritten in the asar data region (legacy path).
 * - Unpacked files are updated on disk under app.asar.unpacked/ and only the
 *   header metadata (size/integrity) is refreshed; Electron resolves them from
 *   disk at runtime.
 *
 * Recomputes per-file SHA256 integrity blocks and the header-JSON hash for
 * ElectronAsarIntegrity. Idempotent: re-running refreshes the asset payload
 * and any shell missing the marker; safe to run repeatedly.
 * ============================================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BLOCK_SIZE = 4194304;
const MARKER = 'workbuddy-rtl.css';
const PATCH_VERSION = '1.5.0';

function readHeader(fd) {
  const sb = Buffer.alloc(8);
  fs.readSync(fd, sb, 0, 8, 0);
  if (sb.readUInt32LE(0) !== 4) throw new Error('not an asar archive (bad magic)');
  const headerLen = sb.readUInt32LE(4);
  const hb = Buffer.alloc(headerLen);
  fs.readSync(fd, hb, 0, headerLen, 8);
  const payloadSize = hb.readUInt32LE(0);
  if (4 + payloadSize !== hb.length) throw new Error('header pickle size mismatch');
  const strLen = hb.readUInt32LE(4);
  const json = hb.slice(8, 8 + strLen).toString('utf8');
  return { header: JSON.parse(json), dataStart: 8 + headerLen, jsonString: json };
}

function pickleString(str) {
  const sb = Buffer.from(str, 'utf8');
  const pad = (4 - (sb.length % 4)) % 4;
  const payloadSize = 4 + sb.length + pad;
  const out = Buffer.alloc(4 + payloadSize);
  out.writeUInt32LE(payloadSize, 0);
  out.writeUInt32LE(sb.length, 4);
  sb.copy(out, 8);
  return out;
}

function fileIntegrity(buf) {
  const blocks = [];
  for (let off = 0; off < buf.length; off += BLOCK_SIZE) {
    blocks.push(crypto.createHash('sha256').update(buf.slice(off, off + BLOCK_SIZE)).digest('hex'));
  }
  if (blocks.length === 0) blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  const hash = blocks.length === 1
    ? blocks[0]
    : crypto.createHash('sha256').update(Buffer.concat(blocks.map((b) => Buffer.from(b, 'hex')))).digest('hex');
  return { algorithm: 'SHA256', hash, blockSize: BLOCK_SIZE, blocks };
}

function getNode(header, parts) {
  let cur = header;
  for (const p of parts) {
    if (!cur.files || !cur.files[p]) return null;
    cur = cur.files[p];
  }
  return cur;
}

function readPackedFile(fd, dataStart, node) {
  const off = Number(node.offset);
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, dataStart + off);
  return buf;
}

function readUnpackedFile(asarPath, relPath, node) {
  const full = path.join(asarPath + '.unpacked', relPath);
  // trust the on-disk file if present; fall back to asar if not.
  if (fs.existsSync(full)) return fs.readFileSync(full);
  return null;
}

function walkFiles(node, prefix, out) {
  const files = node.files || {};
  for (const name of Object.keys(files)) {
    const child = files[name];
    if (child.files) walkFiles(child, prefix.concat(name), out);
    else out.push({ node: child, pathParts: prefix.concat(name) });
  }
}

/* RTL payload snippet for any html shell (index + markdown guest). Same
   MARKER so idempotency is per-file. */
function buildShellHtml(oldHtml, cssFile, jsFile) {
  const oldStr = oldHtml.toString('utf8');
  if (oldStr.includes(MARKER)) return { html: null, already: true };
  const snippet = [
    '  <!-- WorkBuddy RTL patch v' + PATCH_VERSION + ': Vazirmatn font + auto RTL -->',
    '  <link rel="stylesheet" href="./assets/' + cssFile + '">',
    '  <script src="./assets/' + jsNamePlaceholder(jsFile) + '" defer></script>',
  ].join('\n') + '\n';
  let next = oldStr;
  if (next.includes('</head>')) next = next.replace('</head>', snippet + '</head>');
  else next = next + snippet;
  return { html: Buffer.from(next, 'utf8'), already: false };
}

function jsNamePlaceholder(s) { return s; }

function unpackedPathFor(asarPath, relPath) {
  return path.join(asarPath + '.unpacked', relPath);
}

function ensureUnpackedDir(asarPath, relPath) {
  const full = unpackedPathFor(asarPath, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  return full;
}

function main() {
  const [asarPath, cssPath, jsPath] = process.argv.slice(2);
  if (!asarPath || !cssPath || !jsPath) {
    console.error('usage: node inject-asar.js <app.asar> <workbuddy-rtl.css> <workbuddy-rtl.js>');
    process.exit(2);
  }
  const cssName = path.basename(cssPath);
  const jsName = path.basename(jsPath);
  const cssBytes = fs.readFileSync(cssPath);
  const jsBytes = fs.readFileSync(jsPath);
  if (cssBytes.length >= BLOCK_SIZE || jsBytes.length >= BLOCK_SIZE) {
    throw new Error('payload file exceeds single integrity block');
  }

  let fd = fs.openSync(asarPath, 'r');
  let { header, dataStart, jsonString } = readHeader(fd);

  const renderer = getNode(header, ['renderer']);
  if (!renderer || !renderer.files) { fs.closeSync(fd); throw new Error('renderer/ not found in asar'); }

  // HTML shells receiving the RTL payload: main window + markdown preview iframe.
  const SHELLS = ['renderer/index.html', 'renderer/markdown-shared-guest.html'];
  const shells = []; // {rel, node, unpacked, oldBytes, newBytes, already}
  for (const rel of SHELLS) {
    const parts = rel.split('/');
    const node = getNode(header, parts);
    if (!node || node.link != null) {
      if (rel === 'renderer/index.html') { fs.closeSync(fd); throw new Error('renderer/index.html not found or is a link'); }
      continue; // guest shell absent in older builds: skip without failing
    }
    const unpacked = !!node.unpacked;
    let oldBytes;
    if (unpacked) {
      const onDisk = readUnpackedFile(asarPath, rel, node);
      oldBytes = onDisk || readPackedFile(fd, dataStart, node);
    } else {
      oldBytes = readPackedFile(fd, dataStart, node);
    }
    const r = buildShellHtml(oldBytes, cssName, jsName);
    shells.push({ rel, node, unpacked, oldBytes, newBytes: r.html, already: r.already });
  }
  if (!shells.length) { fs.closeSync(fd); throw new Error('no html shell found to patch'); }
  const indexEntry = shells.find((x) => x.rel === 'renderer/index.html');
  const already = indexEntry ? indexEntry.already : true;
  const oldIndexBytes = indexEntry ? indexEntry.oldBytes : shells[0].oldBytes;
  const newIndexBytes = indexEntry ? indexEntry.newBytes : null;

  if (!renderer.files.assets || !renderer.files.assets.files) {
    fs.closeSync(fd); throw new Error('renderer/assets/ not found in asar');
  }
  const assets = renderer.files.assets.files;

  // decide packed vs unpacked for new asset entries.
  // Match the archive's own convention: if index is unpacked, ship unpacked.
  const useUnpacked = indexEntry ? indexEntry.unpacked : shells[0].unpacked;

  // Helper to write payload text to storage
  function writePayloadToStorage(name, bytes) {
    if (useUnpacked) {
      const full = ensureUnpackedDir(asarPath, 'renderer/assets/' + name);
      fs.writeFileSync(full, bytes);
    }
  }

  // --- apply header mutations ---
  const newBuffers = new Map(); // packed entries only

  for (const sh of shells) {
    if (!sh.newBytes) continue;
    sh.node.size = sh.newBytes.length;
    sh.node.integrity = fileIntegrity(sh.newBytes);
    if (sh.unpacked) {
      delete sh.node.offset;
      const full = ensureUnpackedDir(asarPath, sh.rel);
      fs.writeFileSync(full, sh.newBytes);
    } else {
      newBuffers.set(sh.rel, sh.newBytes);
    }
  }

  // CSS
  const ensureAsset = (name, bytes) => {
    const existing = assets[name];
    const existingUnpacked = !!(existing && existing.unpacked);
    const unpacked = existing ? existingUnpacked : useUnpacked;
    if (existing) {
      existing.size = bytes.length;
      existing.integrity = fileIntegrity(bytes);
    } else {
      const entry = { size: bytes.length, integrity: fileIntegrity(bytes) };
      if (unpacked) entry.unpacked = true;
      assets[name] = entry;
    }
    if (unpacked) {
      delete assets[name].offset;
      const full = ensureUnpackedDir(asarPath, 'renderer/assets/' + name);
      fs.writeFileSync(full, bytes);
    } else {
      newBuffers.set('renderer/assets/' + name, bytes);
    }
  };

  ensureAsset(cssName, cssBytes);
  ensureAsset(jsName, jsBytes);

  // --- register payload in the guest static-html allowlist ---
  // renderer/markdown-shared-guest-files.json is an ALLOWLIST consulted by the
  // app's StaticHtmlHttpServer when serving the markdown-preview iframe; any
  // path missing from it gets 403, so the injected script/style would never
  // load there (verified live: 403 for workbuddy-rtl.*, 200 for listed files).
  const allowRel = 'renderer/markdown-shared-guest-files.json';
  const allowNode = getNode(header, allowRel.split('/'));
  let allowPatched = false;
  if (allowNode && allowNode.link == null) {
    const allowUnpacked = !!allowNode.unpacked;
    const oldAllow = allowUnpacked
      ? (readUnpackedFile(asarPath, allowRel, allowNode) || readPackedFile(fd, dataStart, allowNode))
      : readPackedFile(fd, dataStart, allowNode);
    const manifest = JSON.parse(oldAllow.toString('utf8'));
    if (Array.isArray(manifest.files)) {
      const wanted = ['assets/' + cssName, 'assets/' + jsName];
      const added = [];
      for (const w of wanted) {
        if (!manifest.files.includes(w)) { manifest.files.push(w); added.push(w); }
      }
      // keep key order stable: version, entry, files
      const nextAllow = Buffer.from(JSON.stringify({
        version: manifest.version,
        entry: manifest.entry,
        files: manifest.files,
      }), 'utf8');
      allowNode.size = nextAllow.length;
      allowNode.integrity = fileIntegrity(nextAllow);
      allowPatched = added.length > 0;
      if (allowUnpacked) {
        delete allowNode.offset;
        const full = ensureUnpackedDir(asarPath, allowRel);
        fs.writeFileSync(full, nextAllow);
      } else {
        newBuffers.set(allowRel, nextAllow);
      }
      if (added.length) console.error('guest allowlist += ' + added.join(', '));
    }
  }

  // --- rewrite asar header; keep packed data region for packed entries ---
  // Recompute file offsets only for packed entries in DFS order.
  const entries = [];
  walkFiles(header, [], entries);
  const plan = []; // {node, key, src}
  for (const { node, pathParts } of entries) {
    if (node.unpacked || node.link != null) continue;
    const key = pathParts.join('/');
    const replacement = newBuffers.get(key);
    if (replacement) {
      plan.push({ node, src: { kind: 'new', buf: replacement } });
    } else {
      // skip nodes without offset (shouldn't happen for packed)
      if (node.offset == null) continue;
      plan.push({ node, src: { kind: 'old', off: Number(node.offset), size: node.size } });
    }
  }
  let cursor = 0;
  for (const { node } of plan) {
    const srcSize = node.size;
    node.offset = String(cursor);
    cursor += srcSize;
  }

  const dir = path.dirname(asarPath);
  const tmpPath = path.join(dir, '.asar-patch-' + process.pid + '.tmp');
  const out = fs.openSync(tmpPath, 'w');
  try {
    const headerJson = JSON.stringify(header);
    const headerPickle = pickleString(headerJson);
    const sizePickle = Buffer.alloc(8);
    sizePickle.writeUInt32LE(4, 0);
    sizePickle.writeUInt32LE(headerPickle.length, 4);
    fs.writeSync(out, sizePickle, 0, 8, 0);
    fs.writeSync(out, headerPickle, 0, headerPickle.length, 8);
    const newDataStart = headerPickle.length + 8;
    const chunk = Buffer.alloc(1024 * 1024);
    for (const { node, src } of plan) {
      const destOff = newDataStart + Number(node.offset);
      if (src.kind === 'new') {
        fs.writeSync(out, src.buf, 0, src.buf.length, destOff);
      } else {
        let remaining = src.size;
        let rOff = dataStart + src.off;
        let wOff = destOff;
        while (remaining > 0) {
          const n = Math.min(chunk.length, remaining);
          fs.readSync(fd, chunk, 0, n, rOff);
          fs.writeSync(out, chunk, 0, n, wOff);
          remaining -= n;
          rOff += n;
          wOff += n;
        }
      }
    }
    fs.fsyncSync(out);
  } finally {
    fs.closeSync(out);
  }
  fs.closeSync(fd);
  fs.renameSync(tmpPath, asarPath);

  // --- verify ---
  let vfd = fs.openSync(asarPath, 'r');
  let writtenJson;
  const shellStates = [];
  try {
    const v = readHeader(vfd);
    writtenJson = v.jsonString;
    for (const sh of shells) {
      const vi = getNode(v.header, sh.rel.split('/'));
      let vb;
      if (vi.unpacked) {
        vb = fs.readFileSync(unpackedPathFor(asarPath, sh.rel)).toString('utf8');
      } else {
        vb = readPackedFile(vfd, v.dataStart, vi).toString('utf8');
      }
      if (!vb.includes(MARKER)) throw new Error('verify failed: marker missing in ' + sh.rel);
      shellStates.push({ shell: sh.rel, alreadyPatched: sh.already, mode: vi.unpacked ? 'unpacked' : 'packed', bytes: vb.length });
    }
    const vcss = getNode(v.header, ['renderer', 'assets', cssName]);
    const vjs = getNode(v.header, ['renderer', 'assets', jsName]);
    if (!vcss) throw new Error('verify failed: css missing');
    if (!vjs) throw new Error('verify failed: js missing');
    // verify asset bytes exist
    if (vcss.unpacked) {
      if (!fs.existsSync(unpackedPathFor(asarPath, 'renderer/assets/' + cssName))) throw new Error('verify failed: unpacked css missing on disk');
    }
    if (vjs.unpacked) {
      if (!fs.existsSync(unpackedPathFor(asarPath, 'renderer/assets/' + jsName))) throw new Error('verify failed: unpacked js missing on disk');
    }
  } finally {
    fs.closeSync(vfd);
  }

  const guestEntry = shells.find((x) => x.rel === 'renderer/markdown-shared-guest.html');
  console.log(JSON.stringify({
    patched: true,
    indexAlreadyPatched: already,
    guestAlreadyPatched: guestEntry ? guestEntry.already : null,
    guestAllowlistPatched: allowPatched,
    shells: shellStates,
    indexMode: indexEntry ? (indexEntry.unpacked ? 'unpacked' : 'packed') : null,
    assetsMode: useUnpacked ? 'unpacked' : 'packed',
    indexHtmlBytes: newIndexBytes ? newIndexBytes.length : oldIndexBytes.length,
    cssBytes: cssBytes.length,
    jsBytes: jsBytes.length,
    headerJsonSha256: crypto.createHash('sha256').update(Buffer.from(writtenJson, 'utf8')).digest('hex'),
  }));
}

main();

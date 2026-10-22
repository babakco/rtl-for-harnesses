#!/usr/bin/env node
/*
 * asar-patch.cjs — surgical, append-only patcher for Electron `app.asar`.
 *
 * Why not `asar extract` + `asar pack`?
 *   The DSH bundle is 117 MB and carries 1492 `unpacked: true` entries
 *   (LibreOfficeKit, @swc, node-pty, fontkit …). Round-tripping it through the
 *   official packer means re-deriving every `--unpack` glob and re-writing the
 *   whole file, which is slow and easy to get subtly wrong.
 *
 *   Instead we keep every original byte untouched and only:
 *     1. append the new/replacement file payloads to the end of the data
 *        section (existing offsets therefore stay valid),
 *     2. add / update the matching header entries,
 *     3. rewrite the (now longer) header pickle in front of the data,
 *     4. recompute both the per-file `integrity` blocks and the whole-archive
 *        header SHA-256 that Electron's `ElectronAsarIntegrity` plist key
 *        verifies.
 *
 * asar on-disk layout (little-endian u32 unless noted):
 *     [0]      u32  = 4                 size of the outer pickle payload
 *     [4]      u32  = 4 + payloadSize   size of the header pickle
 *     [8]      u32  = payloadSize       4 + padded(jsonLen)
 *     [12]     u32  = jsonLen           byte length of the header JSON
 *     [16]     json bytes              then zero padding up to a 4-byte bound
 *     ...           file data, offsets in the header are relative to here
 *
 * The ElectronAsarIntegrity hash is sha256 over the *unpadded* header JSON —
 * confirmed against the shipped com.deepseek.dsh bundle.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BLOCK_SIZE = 4194304; // matches the blockSize the official packer writes
const MAGIC = { OUTER: 4 };

const align4 = (n) => (4 - (n % 4)) % 4;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** ElectronAsarIntegrity.hash — sha256 of the raw, unpadded header JSON. */
function headerDigest(jsonBuf) {
  return sha256(jsonBuf);
}

/** Per-file integrity block, byte-for-byte shaped like the official packer's. */
function fileIntegrity(buf) {
  const blocks = [];
  if (buf.length === 0) {
    blocks.push(sha256(buf));
  } else {
    for (let off = 0; off < buf.length; off += BLOCK_SIZE) {
      blocks.push(sha256(buf.subarray(off, Math.min(off + BLOCK_SIZE, buf.length))));
    }
  }
  return {
    algorithm: 'SHA256',
    hash: sha256(buf),
    blockSize: BLOCK_SIZE,
    blocks,
  };
}

function readHeader(buf) {
  if (buf.length < 16) throw new Error('file is too small to be an asar archive');
  const outer = buf.readUInt32LE(0);
  if (outer !== MAGIC.OUTER) {
    throw new Error(`unexpected outer pickle size ${outer}; not an asar archive`);
  }
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 16;
  const jsonEnd = jsonStart + jsonLen;
  if (jsonEnd > buf.length) throw new Error('header JSON extends past end of file');
  const json = JSON.parse(buf.subarray(jsonStart, jsonEnd).toString('utf8'));
  if (!json || typeof json !== 'object' || !json.files) {
    throw new Error('header JSON has no "files" table');
  }
  const dataStart = jsonStart + jsonLen + align4(jsonLen);
  return { json, jsonLen, dataStart };
}

function buildHeader(json) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const payloadSize = 4 + jsonBuf.length + align4(jsonBuf.length);
  const pickleSize = 4 + payloadSize;
  const head = Buffer.alloc(16 + jsonBuf.length + align4(jsonBuf.length));
  head.writeUInt32LE(MAGIC.OUTER, 0);
  head.writeUInt32LE(pickleSize, 4);
  head.writeUInt32LE(payloadSize, 8);
  head.writeUInt32LE(jsonBuf.length, 12);
  jsonBuf.copy(head, 16);
  return { head, jsonBuf };
}

/** Walk (creating as needed) the `files` table down to the parent of `segments`. */
function resolveParent(root, segments, create) {
  let node = root;
  for (const segment of segments) {
    if (!node.files) node.files = {};
    let next = node.files[segment];
    if (next === undefined) {
      if (!create) return null;
      next = { files: {} };
      node.files[segment] = next;
    } else if (next.files && !next.unpacked) {
      // directory, descend
    } else if (create) {
      throw new Error(`cannot create ${segments.join('/')}: "${segment}" is an existing file`);
    }
    node = next;
  }
  return node;
}

/**
 * Apply a list of edits to an asar buffer, returning a new buffer plus the
 * header digest to place in Info.plist.
 *
 * @param {Buffer} original raw app.asar contents
 * @param {Array<{path: string, data: Buffer, executable?: boolean}>} edits
 */
function patch(original, edits) {
  const { json, dataStart } = readHeader(original);
  const originalData = original.subarray(dataStart);

  const appended = [];
  let cursor = originalData.length;

  for (const edit of edits) {
    const segments = edit.path.split('/').filter(Boolean);
    if (segments.length === 0) throw new Error('edit path must not be empty');
    const leaf = segments.pop();
    const parent = resolveParent(json, segments, true);
    if (!parent.files) parent.files = {};

    const previous = parent.files[leaf];
    if (previous && previous.files) {
      // A directory sits where a file must go; splice it out.
      delete parent.files[leaf];
    }

    const offset = cursor;
    appended.push(edit.data);
    cursor += edit.data.length;

    const entry = {
      size: edit.data.length,
      offset: String(offset),
    };
    if (edit.executable) entry.executable = true;
    entry.integrity = fileIntegrity(edit.data);
    parent.files[leaf] = entry;
  }

  const { head, jsonBuf } = buildHeader(json);

  const out = Buffer.concat([head, originalData, ...appended]);
  return { out, headerHash: headerDigest(jsonBuf), jsonLen: jsonBuf.length };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length < 3) {
    process.stderr.write(
      'usage: asar-patch.cjs <input.asar> <output.asar> <edits.json>\n' +
        '  edits.json = [{"path": "a/b.txt", "src": "local/file", "executable": false}]\n'
    );
    return 2;
  }
  const [inputAsar, outputAsar, editsJson] = args;
  const spec = JSON.parse(fs.readFileSync(editsJson, 'utf8'));
  const editsDir = path.dirname(path.resolve(editsJson));

  const edits = spec.map((item) => ({
    path: item.path,
    data: fs.readFileSync(path.resolve(editsDir, item.src)),
    executable: Boolean(item.executable),
  }));

  const original = fs.readFileSync(inputAsar);
  const { out, headerHash, jsonLen } = patch(original, edits);

  fs.writeFileSync(outputAsar, out);
  const result = {
    input: inputAsar,
    output: outputAsar,
    headerHash,
    jsonLen,
    bytesIn: original.length,
    bytesOut: out.length,
    edits: edits.map((e) => ({ path: e.path, size: e.data.length })),
  };
  fs.writeFileSync(outputAsar + '.patchmeta.json', JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv));
  } catch (error) {
    process.stderr.write(`asar-patch: ${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  }
}

module.exports = { patch, readHeader, fileIntegrity, headerDigest, align4 };

/**
 * Dependency-free reader/writer for the Electron `asar` archive format.
 *
 * On-disk layout (little-endian u32 unless noted):
 *
 *   [0]   u32   = 4                      size of the outer "size pickle" payload
 *   [4]   u32   = 4 + payloadSize        size of the header pickle buffer
 *   [8]   u32   = 4 + padded(jsonLen)    size of the header pickle payload
 *   [12]  u32   = jsonLen                byte length of the header JSON
 *   [16]  bytes = header JSON            zero-padded to a 4 byte boundary
 *   dataStart    bytes = file contents   entry offsets are relative to this
 *
 * with `dataStart = 16 + align4(jsonLen)` and every file entry holding
 * `{ size, offset }` where `offset` is a *string* relative to `dataStart`.
 *
 * This writer never moves the existing data section. New bytes are appended to
 * the end of the data area, so every existing entry keeps its relative offset.
 * Growing the header shifts the data section in absolute terms, but because
 * offsets are relative to the data start they stay valid. Patching a 300 MB
 * `app.asar` therefore costs one streaming copy instead of an extract+repack.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

export const INTEGRITY_BLOCK_SIZE = 4 * 1024 * 1024;
const JSON_START = 16;

export const align4 = (n) => (4 - (n % 4)) % 4;
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Electron's `ElectronAsarIntegrity` plist key stores a digest of the archive
 * header JSON. Different builders use different framings, so we never assume:
 * {@link detectHeaderDigest} proves which framing a given archive uses by
 * reproducing the digest shipped in its own Info.plist.
 */
export function headerDigestFromJson(jsonBuf) {
  return sha256(jsonBuf);
}

export function readAsar(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16);
    if (fs.readSync(fd, head, 0, 16, 0) !== 16) {
      throw new Error(`not an asar archive (file too small): ${asarPath}`);
    }
    const outer = head.readUInt32LE(0);
    if (outer !== 4) throw new Error(`unexpected outer pickle size ${outer}; not an asar archive`);
    const headerBufLen = head.readUInt32LE(4);
    const payloadSize = head.readUInt32LE(8);
    const jsonLen = head.readUInt32LE(12);
    if (jsonLen <= 0 || jsonLen > payloadSize || JSON_START + jsonLen + align4(jsonLen) !== 8 + headerBufLen) {
      throw new Error(
        `corrupt asar header: jsonLen=${jsonLen} payloadSize=${payloadSize} headerBufLen=${headerBufLen}`,
      );
    }
    const jsonBuf = Buffer.alloc(jsonLen);
    fs.readSync(fd, jsonBuf, 0, jsonLen, JSON_START);
    const json = JSON.parse(jsonBuf.toString('utf8'));
    if (!json || typeof json !== 'object' || !json.files) {
      throw new Error('asar header has no "files" table');
    }
    const fileSize = fs.fstatSync(fd).size;
    const dataStart = JSON_START + jsonLen + align4(jsonLen);
    return {
      fd,
      path: asarPath,
      json,
      jsonBuf,
      jsonLen,
      headerBufLen,
      dataStart,
      fileSize,
      dataSize: fileSize - dataStart,
    };
  } catch (err) {
    fs.closeSync(fd);
    throw err;
  }
}

export function closeAsar(handle) {
  if (handle && handle.fd !== undefined) {
    try {
      fs.closeSync(handle.fd);
    } catch {
      /* already closed */
    }
    handle.fd = undefined;
  }
}

export function* walkEntries(node = { files: {} }, prefix = '') {
  for (const name of Object.keys(node.files || {})) {
    const entry = node.files[name];
    const rel = prefix ? `${prefix}/${name}` : name;
    if (entry && entry.files) {
      yield* walkEntries(entry, rel);
    } else if (entry) {
      yield { path: rel, entry };
    }
  }
}

export function findEntry(json, relPath) {
  let node = json;
  for (const part of relPath.split('/').filter(Boolean)) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node;
}

export function readEntry(handle, relPath) {
  const entry = findEntry(handle.json, relPath);
  if (!entry) throw new Error(`no such asar entry: ${relPath}`);
  if (entry.files) throw new Error(`entry is a directory: ${relPath}`);
  if (entry.unpacked) {
    const unpacked = `${handle.path}.unpacked/${relPath}`;
    return fs.readFileSync(unpacked);
  }
  if (typeof entry.link === 'string') {
    throw new Error(`entry is a symbolic link: ${relPath}`);
  }
  const size = Number(entry.size || 0);
  if (size === 0) return Buffer.alloc(0);
  const start = handle.dataStart + Number(entry.offset || 0);
  const buf = Buffer.alloc(size);
  let read = 0;
  while (read < size) {
    const n = fs.readSync(handle.fd, buf, read, size - read, start + read);
    if (n <= 0) throw new Error(`unexpected EOF while reading ${relPath}`);
    read += n;
  }
  return buf;
}

export function readFileFromAsar(asarPath, relPath) {
  const handle = readAsar(asarPath);
  try {
    return readEntry(handle, relPath);
  } finally {
    closeAsar(handle);
  }
}

/** `@electron/asar` compatible per-file integrity metadata. */
export function computeIntegrity(buf) {
  const blocks = [];
  if (buf.length === 0) {
    blocks.push(sha256(buf));
  } else {
    for (let off = 0; off < buf.length; off += INTEGRITY_BLOCK_SIZE) {
      blocks.push(sha256(buf.subarray(off, Math.min(off + INTEGRITY_BLOCK_SIZE, buf.length))));
    }
  }
  return { algorithm: 'SHA256', hash: sha256(buf), blockSize: INTEGRITY_BLOCK_SIZE, blocks };
}

function ensureDirNode(json, dirRel) {
  let node = json;
  for (const part of dirRel.split('/').filter((p) => p && p !== '.')) {
    if (!node.files) node.files = {};
    const next = node.files[part];
    if (next && !next.files) throw new Error(`cannot create directory under file "${part}"`);
    if (!next) node.files[part] = { files: {} };
    node = node.files[part];
    if (!node.files) node.files = {};
  }
  return node;
}

function dirName(relPath) {
  const i = relPath.lastIndexOf('/');
  return i === -1 ? '' : relPath.slice(0, i);
}

function buildHeader(json) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const padded = jsonBuf.length + align4(jsonBuf.length);
  const payloadSize = 4 + padded;
  const headerBufLen = 4 + payloadSize;
  const head = Buffer.alloc(JSON_START + padded);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(headerBufLen, 4);
  head.writeUInt32LE(payloadSize, 8);
  head.writeUInt32LE(jsonBuf.length, 12);
  jsonBuf.copy(head, JSON_START);
  return { head, jsonBuf, headerBufLen };
}

/**
 * Rewrite `asarPath` (through a sibling `.tmp` then rename) with an append-only
 * patch:
 *
 *   replace: Map<relPath, Buffer>  existing entries whose content is replaced
 *   add:     Map<relPath, Buffer>  brand new entries
 *
 * Note that "replaced" content is stored *appended*; the stale original bytes
 * stay in place, which is why no offset ever has to be rewritten.
 */
export async function rewriteAsar(asarPath, { replace = new Map(), add = new Map() } = {}) {
  const handle = readAsar(asarPath);
  try {
    const json = handle.json;
    const existing = new Map([...walkEntries(json)].map((item) => [item.path, item.entry]));

    const appended = [];
    for (const [relPath, buf] of replace) {
      if (!existing.has(relPath)) throw new Error(`cannot replace missing entry "${relPath}"`);
      if (!Buffer.isBuffer(buf)) throw new Error(`replacement for "${relPath}" must be a Buffer`);
      appended.push({ relPath, buf });
    }
    for (const [relPath, buf] of add) {
      if (existing.has(relPath)) throw new Error(`entry already exists: "${relPath}"`);
      appended.push({ relPath, buf });
    }
    appended.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

    let cursor = handle.dataSize;
    for (const item of appended) {
      const isNew = !existing.has(item.relPath);
      const entry = isNew ? {} : existing.get(item.relPath);
      entry.size = item.buf.length;
      entry.offset = String(cursor);
      entry.integrity = computeIntegrity(item.buf);
      if (isNew) {
        const leaf = item.relPath.slice(item.relPath.lastIndexOf('/') + 1);
        ensureDirNode(json, dirName(item.relPath)).files[leaf] = entry;
      }
      cursor += item.buf.length;
    }

    const { head, jsonBuf, headerBufLen } = buildHeader(json);
    const tmpPath = `${asarPath}.zcode-rtl.tmp`;

    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmpPath);
      let failed = false;
      const fail = (err) => {
        if (failed) return;
        failed = true;
        out.destroy();
        fs.rm(tmpPath, { force: true }, () => reject(err));
      };
      out.on('error', fail);
      out.write(head);
      const src = fs.createReadStream(asarPath, {
        start: handle.dataStart,
        end: handle.fileSize - 1,
        highWaterMark: 1 << 24,
      });
      src.on('error', fail);
      src.on('data', (chunk) => {
        if (!out.write(chunk)) src.pause(), out.once('drain', () => src.resume());
      });
      src.on('end', () => {
        for (const item of appended) out.write(item.buf);
        out.end();
      });
      out.on('finish', resolve);
    });

    fs.renameSync(tmpPath, asarPath);
    return {
      replaced: replace.size,
      added: add.size,
      entriesBefore: existing.size,
      headerDigest: headerDigestFromJson(jsonBuf),
      jsonLen: jsonBuf.length,
      headerBufLen,
      bytesIn: handle.fileSize,
      bytesOut: fs.statSync(asarPath).size,
    };
  } finally {
    closeAsar(handle);
  }
}

/** List every packed entry path in an archive (optionally filtered). */
export function listEntries(asarPath, filter) {
  const handle = readAsar(asarPath);
  try {
    const out = [];
    for (const item of walkEntries(handle.json)) {
      if (!filter || filter(item)) {
        out.push({ path: item.path, size: Number(item.entry.size || 0), entry: item.entry });
      }
    }
    return out;
  } finally {
    closeAsar(handle);
  }
}

export { JSON_START, dirName };

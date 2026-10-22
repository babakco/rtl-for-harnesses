import { hasMarkers, injectionByteLength } from './inject.mjs';

const UNPACKED_MARKER = 'app.asar.unpacked/';

export const ALLOWED_DIFFERENCES = {
  addedAssets: ['/webview/assets/codex-rtl.css', '/webview/assets/codex-rtl.js'],
  injectedHtml: ['/webview/index.html', '/webview/detached-window.html']
};

export function deriveUnpackGlobs(unpackedFiles) {
  const out = new Set();
  for (const abs of unpackedFiles || []) {
    const text = String(abs);
    const idx = text.indexOf(UNPACKED_MARKER);
    if (idx === -1) {
      continue;
    }
    const rel = text.slice(idx + UNPACKED_MARKER.length).replace(/^\/+/, '');
    if (!rel) {
      continue;
    }
    out.add(rel);
  }
  return [...out].sort();
}

export function verifyRepackInvariant(origJson, newJson) {
  let orig;
  let newer;
  try {
    orig = JSON.parse(String(origJson));
  } catch {
    return { ok: false, reason: 'orig listing is not valid JSON' };
  }
  try {
    newer = JSON.parse(String(newJson));
  } catch {
    return { ok: false, reason: 'new listing is not valid JSON' };
  }
  if (!Array.isArray(orig) || !Array.isArray(newer)) {
    return { ok: false, reason: 'listings must be JSON arrays' };
  }
  const origByPath = new Map(orig.map((e) => [e.path, e]));
  const newByPath = new Map(newer.map((e) => [e.path, e]));
  for (const p of origByPath.keys()) {
    if (!newByPath.has(p)) {
      return { ok: false, reason: 'missing path in repack: ' + p };
    }
  }
  const added = [...newByPath.keys()].filter((p) => !origByPath.has(p)).sort();
  const want = [...ALLOWED_DIFFERENCES.addedAssets].sort();
  for (const p of want) {
    if (!newByPath.has(p)) {
      return { ok: false, reason: 'missing added asset: ' + p };
    }
  }
  if (added.length !== want.length || added.some((p, i) => p !== want[i])) {
    return { ok: false, reason: 'unexpected added paths: ' + JSON.stringify(added) };
  }
  const injected = new Set(ALLOWED_DIFFERENCES.injectedHtml);
  const expectedDelta = injectionByteLength();
  for (const [p, o] of origByPath) {
    const n = newByPath.get(p);
    if (Boolean(o.unpacked) !== Boolean(n.unpacked)) {
      return { ok: false, reason: 'unpacked flag changed: ' + p };
    }
    if (o.isDirectory || n.isDirectory) {
      continue;
    }
    if (injected.has(p)) {
      const origSize = Number(o.size);
      const newSize = Number(n.size);
      if (!(newSize > origSize)) {
        return { ok: false, reason: 'injected html did not grow: ' + p };
      }
      if (newSize - origSize !== expectedDelta) {
        return { ok: false, reason: 'injected html growth mismatch: ' + p + ' expected ' + expectedDelta + ' got ' + (newSize - origSize) };
      }
      if (typeof n.content === 'string') {
        if (!n.content.includes('</head>')) {
          return { ok: false, reason: 'injected html missing </head>: ' + p };
        }
        if (!hasMarkers(n.content)) {
          return { ok: false, reason: 'injected html missing markers: ' + p };
        }
      }
      continue;
    }
    if (Number(o.size) !== Number(n.size)) {
      return { ok: false, reason: 'size changed: ' + p };
    }
  }
  return { ok: true, reason: 'repack invariant holds' };
}

/**
 * patch-app.mjs — plan the payload edits for a ZCode `app.asar`.
 *
 * ZCode's renderer documents are plain files inside the archive
 * (`out/renderer/*.html`) loaded by the main process through `loadFile`, so the
 * Electron `file://` handler serves them straight out of `app.asar`. A relative
 * `<link>`/`<script>` injected before `</head>` therefore loads the payload
 * without touching any app code — provided no Content-Security-Policy meta
 * blocks it. The shipped documents carry no CSP, but {@link relaxCsp} widens a
 * policy defensively if a future build adds one.
 *
 * This module only *plans* changes: {@link planEdits} returns the `replace`/`add`
 * maps that `rewriteAsar` consumes, so it is pure and directly unit-testable.
 */

import { walkEntries, readEntry, findEntry } from './asar.mjs';

/** Where the payload is written inside the archive. */
export const RENDERER_DIR = 'out/renderer';
export const RTL_CSS = `${RENDERER_DIR}/zcode-rtl.css`;
export const RTL_JS = `${RENDERER_DIR}/zcode-rtl.js`;
export const RTL_FONT = `${RENDERER_DIR}/fonts/vazirmatn-var.woff2`;

/** Marker used to detect that a document was already patched (idempotency). */
export const MARKER = 'zcode-rtl.css';

const HTML_RE = /^out\/renderer\/.*\.html$/;

/** Relative `../` prefix that walks from `dir` up to `RENDERER_DIR`. */
function prefixToRenderer(dir) {
  const from = dir ? dir.split('/').filter(Boolean) : [];
  const to = RENDERER_DIR.split('/').filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  const ups = from.length - common;
  return ups === 0 ? './' : '../'.repeat(ups);
}

/** Insert `snippet` immediately before the last `</head>`; once only. */
export function injectHead(html, snippet, marker = MARKER) {
  if (html.includes(marker)) return { html, changed: false };
  const index = html.lastIndexOf('</head>');
  if (index === -1) throw new Error('no </head> found while injecting the RTL payload');
  return { html: html.slice(0, index) + snippet + html.slice(index), changed: true };
}

/**
 * Widen a `Content-Security-Policy` meta so a same-origin stylesheet, script and
 * font can load. Returns the HTML unchanged when no policy is present.
 */
export function relaxCsp(html) {
  return html.replace(
    /(<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*content=)(["'])([\s\S]*?)\2/i,
    (match, head, quote, policy) => {
      const widened = policy
        .split(';')
        .map((directive) => {
          const trimmed = directive.trim();
          if (!trimmed) return trimmed;
          const [name, ...rest] = trimmed.split(/\s+/);
          if (!/^(script-src|style-src|font-src|img-src|default-src)$/i.test(name)) return trimmed;
          if (rest.includes("'self'")) return trimmed;
          return `${name} ${rest.join(' ')} 'self'`.trim();
        })
        .join('; ');
      return `${head}${quote}${widened}${quote}`;
    },
  );
}

/** Every renderer HTML document in the archive. */
export function rendererDocuments(handle) {
  return [...walkEntries(handle.json)]
    .filter((item) => HTML_RE.test(item.path))
    .map((item) => item.path)
    .sort();
}

/**
 * Build the `replace`/`add` maps for {@link rewriteAsar}.
 *
 * @param {import('./asar.mjs').*} handle open archive handle
 * @param {{css: Buffer, js: Buffer, font: Buffer}} payload payload buffers
 * @returns {{replace: Map<string, Buffer>, add: Map<string, Buffer>, changed: string[], skipped: string[], unchanged: string[]}}
 */
export function planEdits(handle, payload) {
  const replace = new Map();
  const add = new Map();
  const changed = [];
  const skipped = [];
  const unchanged = [];

  const docs = rendererDocuments(handle);
  if (docs.length === 0) {
    throw new Error('no out/renderer/*.html documents found — ZCode layout changed');
  }

  for (const docPath of docs) {
    const dir = docPath.slice(0, docPath.lastIndexOf('/'));
    const prefix = prefixToRenderer(dir);
    const link = `${prefix}zcode-rtl.css`;
    const script = `${prefix}zcode-rtl.js`;
    const original = readEntry(handle, docPath).toString('utf8');
    const relaxed = relaxCsp(original);

    if (relaxed.includes(MARKER)) {
      unchanged.push(docPath);
      continue;
    }
    const snippet =
      `  <link rel="stylesheet" href="${link}">\n` +
      `  <script src="${script}" defer></script>\n`;
    const result = injectHead(relaxed, snippet);
    if (!result.changed) {
      unchanged.push(docPath);
      continue;
    }
    replace.set(docPath, Buffer.from(result.html, 'utf8'));
    if (relaxed !== original) skipped.push(`${docPath} (CSP relaxed)`);
    changed.push(docPath);
  }

  for (const [path, buf] of [
    [RTL_CSS, payload.css],
    [RTL_JS, payload.js],
    [RTL_FONT, payload.font],
  ]) {
    if (findEntry(handle.json, path)) replace.set(path, buf);
    else add.set(path, buf);
  }

  return { replace, add, changed, skipped, unchanged };
}

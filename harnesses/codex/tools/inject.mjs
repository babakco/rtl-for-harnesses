const START = '<!--CODEX-RTL:START-->';
const END = '<!--CODEX-RTL:END-->';
const SCRIPT_TAG = '<script type="module" src="./assets/codex-rtl.js"></script>';
const LINK_TAG = '<link rel="stylesheet" href="./assets/codex-rtl.css">';
const REGION_RE = /<!--CODEX-RTL:START-->[\s\S]*?<!--CODEX-RTL:END-->/g;

export const INJECTED_BLOCK = START + '\n' + SCRIPT_TAG + '\n' + LINK_TAG + '\n' + END + '\n';

export function injectionByteLength() {
  return Buffer.byteLength(INJECTED_BLOCK, 'utf8');
}

export function injectHtmlWithDelta(html, opts) {
  const input = String(html);
  const output = injectHtml(input, opts);
  return { html: output, delta: Buffer.byteLength(output, 'utf8') - Buffer.byteLength(input, 'utf8') };
}

export function hasMarkers(html) {
  const src = String(html);
  return src.includes(START) && src.includes(END);
}

export function stripMarkers(html) {
  return String(html).replace(REGION_RE, '');
}

export function injectHtml(html, opts) {
  const src = String(html);
  const force = !!(opts && opts.force);
  if (hasMarkers(src) && !force) {
    return src;
  }
  const base = hasMarkers(src) ? stripMarkers(src) : src;
  const idx = base.lastIndexOf('</head>');
  if (idx === -1) {
    return base;
  }
  const block = INJECTED_BLOCK;
  return base.slice(0, idx) + block + base.slice(idx);
}

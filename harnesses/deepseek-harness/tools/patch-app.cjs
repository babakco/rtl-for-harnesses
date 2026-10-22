/*
 * patch-app.cjs — apply the RTL payload to a DeepSeek Harness app.asar.
 *
 * Everything happens inside the asar: the app has no writable UI directory,
 * and its renderer is served straight out of the archive by the `dsh-app://`
 * protocol handler in lib/main.js (function `serveWebDocument`). The handler
 * only allows `/`, `/index.html`, `/assets/*`, `/favicon.svg` and
 * `/manifest.webmanifest`, so every payload file has to live under `assets/`
 * for the main window and beside the document for the shell windows.
 *
 * The asar is rewritten with tools/asar-patch.cjs, which appends new payloads
 * and leaves every original byte in place.
 *
 * usage: node patch-app.cjs <input.asar> <output.asar> <payloadDir>
 * prints: { "headerHash": "...", "bytesIn": n, "bytesOut": n, "changed": [...] }
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { patch, readHeader } = require('./asar-patch.cjs');

const DIST = 'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist';
const ASSET = `${DIST}/assets/rtl`;

const MAIN_LINK =
  '  <link rel="stylesheet" href="./assets/rtl/dsh-rtl.css">\n' +
  '  <script src="./assets/rtl/dsh-rtl.js"></script>\n';
const SHELL_LINK =
  '  <link rel="stylesheet" href="dsh-rtl.css">\n' +
  '  <script src="dsh-rtl.js" defer></script>\n';

/* Locate a file inside an asar buffer from the parsed header. */
function locate(archive, entryPath) {
  const segments = entryPath.split('/').filter(Boolean);
  let node = { files: archive.header.json.files };
  for (const segment of segments) {
    if (!node.files || !node.files[segment]) return null;
    node = node.files[segment];
  }
  return node;
}

function readEntry(archive, entryPath) {
  const entry = locate(archive, entryPath);
  if (!entry) return null;
  if (entry.unpacked) {
    throw new Error(
      `${entryPath} lives in app.asar.unpacked; this patcher only reads packed entries`
    );
  }
  const start = archive.dataStart + Number(entry.offset);
  return archive.buffer.subarray(start, start + entry.size);
}

/** Insert our <link>/<script> right before </head>, exactly once. */
function injectHead(html, snippet, marker) {
  if (html.includes(marker)) return { html, changed: false };
  const index = html.lastIndexOf('</head>');
  if (index === -1) throw new Error(`no </head> found while injecting ${marker}`);
  return { html: html.slice(0, index) + snippet + html.slice(index), changed: true };
}

function main(argv) {
  const [inputAsar, outputAsar, payloadDir] = argv.slice(2);
  if (!payloadDir) {
    process.stderr.write('usage: patch-app.cjs <input.asar> <output.asar> <payloadDir>\n');
    return 2;
  }

  const buffer = fs.readFileSync(inputAsar);
  const header = readHeader(buffer);
  const archive = { buffer, header, dataStart: header.dataStart };

  const edits = [];
  const changed = [];
  const add = (entryPath, data) => {
    edits.push({ path: entryPath, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });
    changed.push(entryPath);
  };

  const read = (rel) => {
    const buf = fs.readFileSync(path.join(payloadDir, rel));
    return buf;
  };

  /* ---- 1. main application window --------------------------------- */
  const indexPath = `${DIST}/index.html`;
  const indexRaw = readEntry(archive, indexPath);
  if (!indexRaw) {
    throw new Error(
      `could not find ${indexPath} in ${inputAsar}. The app layout changed; ` +
        'update the DIST constant in tools/patch-app.cjs to match.'
    );
  }
  const indexInjected = injectHead(indexRaw.toString('utf8'), MAIN_LINK, 'assets/rtl/dsh-rtl.css');
  if (indexInjected.changed) add(indexPath, indexInjected.html);

  add(`${ASSET}/dsh-rtl.css`, read('dsh-rtl.css'));
  add(`${ASSET}/dsh-rtl.js`, read('dsh-rtl.js'));
  add(`${ASSET}/fonts/vazirmatn-var.woff2`, read('fonts/vazirmatn-var.woff2'));

  /* ---- 2. shell windows (welcome, update dialogs) ------------------ */
  /* These live beside the document and run under a CSP that allows
     script-src/style-src/font-src 'self', so same-directory files load. */
  const shellDocs = [
    'renderer/welcome.html',
    'renderer/update-dialog.html',
    'renderer/mandatory-update.html',
  ];
  for (const docPath of shellDocs) {
    const raw = readEntry(archive, docPath);
    if (!raw) continue;
    const result = injectHead(raw.toString('utf8'), SHELL_LINK, 'dsh-rtl.css');
    if (result.changed) add(docPath, result.html);
  }

  /* The login placeholder forbids every remote source, so it needs its CSP
     widened before a same-origin stylesheet will load. */
  const loginPath = 'renderer/policy-login-loading.html';
  const loginRaw = readEntry(archive, loginPath);
  if (loginRaw) {
    let html = loginRaw.toString('utf8');
    const before = html;
    html = html.replace(
      "content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'\"",
      "content=\"default-src 'none'; style-src 'unsafe-inline' 'self'; script-src 'unsafe-inline' 'self'; font-src 'self'; img-src 'self'\""
    );
    if (html !== before) {
      const result = injectHead(html, SHELL_LINK, 'dsh-rtl.css');
      add(loginPath, result.html);
    }
  }

  add('renderer/dsh-rtl.css', read('dsh-rtl.css'));
  add('renderer/dsh-rtl.js', read('dsh-rtl.js'));
  add('renderer/fonts/vazirmatn-var.woff2', read('fonts/vazirmatn-var.woff2'));

  /* ---- 3. neutralise the mandatory-update policy ------------------- */
  /* package.json drives a blocking "you must update" window. The RTL copy
     has no working updater, so leaving it in place could lock the app into a
     dialog it can never satisfy. */
  const pkgRaw = readEntry(archive, 'package.json');
  if (pkgRaw) {
    const manifest = JSON.parse(pkgRaw.toString('utf8'));
    if ('dshMandatoryUpdatePolicy' in manifest) {
      delete manifest.dshMandatoryUpdatePolicy;
      add('package.json', JSON.stringify(manifest, null, 2) + '\n');
    }
  }

  const { out, headerHash } = patch(buffer, edits);
  fs.writeFileSync(outputAsar, out);

  process.stdout.write(
    JSON.stringify(
      { headerHash, bytesIn: buffer.length, bytesOut: out.length, changed },
      null,
      2
    ) + '\n'
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv));
  } catch (error) {
    process.stderr.write(`patch-app: ${error && error.stack ? error.stack : error}\n`);
    process.exit(1);
  }
}

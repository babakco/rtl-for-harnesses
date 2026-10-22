import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildPayload(detectPath, domPath, outPath) {
  const detectSrc = readFileSync(detectPath, 'utf8').replace(/^export\s+/gm, '');
  const domSrc = readFileSync(domPath, 'utf8');
  const out = '(function () {\n'
    + "'use strict';\n"
    + 'try { document.documentElement.dataset.codexRtl = "1"; } catch (e) {}\n'
    + detectSrc.replace(/\s+$/, '') + '\n'
    + domSrc.replace(/\s+$/, '') + '\n'
    + '})();\n';
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, out, 'utf8');
}

const invoked = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const args = process.argv.slice(2);
  const detectPath = args[args.indexOf('--detect') + 1];
  const domPath = args[args.indexOf('--dom') + 1];
  const outPath = args[args.indexOf('--out') + 1];
  if (!detectPath || !domPath || !outPath) {
    process.stderr.write('usage: build-payload.mjs --detect <file> --dom <file> --out <file>\n');
    process.exit(1);
  }
  buildPayload(detectPath, domPath, outPath);
}

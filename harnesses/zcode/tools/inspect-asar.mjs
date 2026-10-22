#!/usr/bin/env node
/*
 * inspect-asar.mjs - read-only reconnaissance of a ZCode app.asar.
 *
 * usage:
 *   node tools/inspect-asar.mjs [app.asar] [--html] [--grep <regex>] [--tree <prefix>]
 */

import { readAsar, closeAsar, walkEntries, readEntry, dirName, headerDigestFromJson } from '../src/asar.mjs';

const DEFAULT_ASAR = '/Applications/ZCode.app/Contents/Resources/app.asar';

const argv = process.argv.slice(2);
const flags = { html: false, grep: null, tree: null, list: false, payload: null, dump: null };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--html') flags.html = true;
  else if (a === '--list') flags.list = true;
  else if (a === '--grep') flags.grep = argv[++i];
  else if (a === '--tree') flags.tree = argv[++i];
  else if (a === '--payload') flags.payload = argv[++i];
  else if (a === '--dump') flags.dump = argv[++i];
  else positional.push(a);
}
const asarPath = positional[0] || DEFAULT_ASAR;

const handle = readAsar(asarPath);
if (flags.dump) {
  process.stdout.write(readEntry(handle, flags.dump));
  closeAsar(handle);
  process.exit(0);
}
console.log(`# ${asarPath}`);
console.log(`# size           ${handle.fileSize}`);
console.log(`# header json    ${handle.jsonLen} bytes`);
console.log(`# data start     ${handle.dataStart}`);
console.log(`# header sha256  ${headerDigestFromJson(handle.jsonBuf)}`);

const all = [...walkEntries(handle.json)];
console.log(`# packed entries ${all.length}`);
console.log(`# unpacked       ${all.filter((e) => e.entry.unpacked).length}`);
console.log('');

if (flags.tree) {
  const prefix = flags.tree.replace(/^\/+/, '');
  const depth = prefix.split('/').filter(Boolean).length;
  const seen = new Set();
  for (const item of all) {
    if (!item.path.startsWith(prefix)) continue;
    const parts = item.path.split('/').slice(0, depth + 2);
    const key = parts.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`${'  '.repeat(parts.length - depth - 1)}${parts[parts.length - 1]}`);
  }
}

if (flags.list || flags.grep) {
  const re = flags.grep ? new RegExp(flags.grep, 'i') : null;
  for (const item of all) {
    if (re && !re.test(item.path)) continue;
    const kind = item.entry.unpacked ? 'u' : 'p';
    console.log(`${kind} ${String(item.entry.size).padStart(10)}  ${item.path}`);
  }
}

if (flags.html) {
  console.log('\n## html documents\n');
  for (const item of all) {
    if (!/\.html?$/i.test(item.path)) continue;
    const buf = readEntry(handle, item.path);
    const text = buf.toString('utf8');
    const headIdx = text.indexOf('</head>');
    const csp = /http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']+)/i.exec(text);
    const scripts = [...text.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]);
    const rootDiv = /<div[^>]+id=["']([^"']+)["']/.exec(text);
    console.log(`--- ${item.path}  (${buf.length} bytes)`);
    console.log(`    dir       : ${dirName(item.path) || '.'}`);
    console.log(`    </head>   : ${headIdx === -1 ? 'MISSING' : headIdx}`);
    console.log(`    csp       : ${csp ? csp[1] : '(none)'}`);
    console.log(`    root div  : ${rootDiv ? rootDiv[1] : '(none)'}`);
    console.log(`    scripts   : ${scripts.slice(0, 4).join(', ') || '(none)'}`);
  }
}

if (flags.payload) {
  console.log(`\n## ${flags.payload}\n`);
  console.log(readEntry(handle, flags.payload).toString('utf8').slice(0, 4000));
}

closeAsar(handle);

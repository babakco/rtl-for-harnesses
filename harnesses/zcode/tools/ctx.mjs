#!/usr/bin/env node
/*
 * ctx.mjs - read-only context grep over app.asar bundles.
 * usage: node tools/ctx.mjs <regex> [--files a,b] [--before N] [--after N] [--out file] [--max N]
 */
import { readAsar, closeAsar, walkEntries, readEntry } from '../src/asar.mjs';
import fs from 'node:fs';

const ASAR = '/Applications/ZCode.app/Contents/Resources/app.asar';
const argv = process.argv.slice(2);
const positional = [];
let regex = null, fileFilter = null, before = 200, after = 400, max = 200, out = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--files') fileFilter = argv[++i].split(',');
  else if (a === '--before') before = +argv[++i];
  else if (a === '--after') after = +argv[++i];
  else if (a === '--max') max = +argv[++i];
  else if (a === '--out') out = argv[++i];
  else positional.push(a);
}
if (positional.length) regex = new RegExp(positional[0], 'g');
if (!regex) { console.error('need regex'); process.exit(1); }

const h = readAsar(ASAR);
const entries = [...walkEntries(h.json)].filter((e) => e.path.endsWith('.js') || e.path.endsWith('.cjs'));
const chunks = [];
for (const e of entries) {
  if (fileFilter && !fileFilter.some((f) => e.path.includes(f))) continue;
  let s;
  try { s = readEntry(h, e.path).toString('utf8'); } catch { continue; }
  let m, n = 0;
  const re = new RegExp(regex.source, regex.flags);
  while ((m = re.exec(s)) !== null) {
    chunks.push({
      file: e.path,
      idx: m.index,
      text: s.slice(Math.max(0, m.index - before), m.index + after),
    });
    n++;
    if (n >= max) break;
    if (m.index === re.lastIndex) re.lastIndex++;
    if (chunks.length >= max * 3) break;
  }
  if (chunks.length >= max * 3) break;
}
closeAsar(h);
let text = chunks.map((c, i) => `\n===== [${i}] ${c.file} @${c.idx} =====\n${c.text}`).join('\n');
if (out) { fs.writeFileSync(out, text); console.log('wrote', out, text.length, 'bytes,', chunks.length, 'matches'); }
else console.log(text);

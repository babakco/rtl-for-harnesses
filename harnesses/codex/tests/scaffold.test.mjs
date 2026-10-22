import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Duplicate-source identity check (shasum -a 256): Regular e382101336c6eb32cfb31381c027d02d2e0354bad08f6a395d4088beb3db3d91 and Bold 836fae7d42d83faa249bc00e0099592be98a1fa260d22d82f269b6091e585627 are byte-identical across the claude-desktop-rtl-mac and qoder-rtl-patch sources, so keeping one copy each is lossless.

test('fonts: all three woff2 files exist and are non-empty', () => {
  for (const f of ['fonts/Vazirmatn-Regular.woff2', 'fonts/Vazirmatn-Medium.woff2', 'fonts/Vazirmatn-Bold.woff2']) {
    const st = statSync(path.join(root, f));
    assert.ok(st.size > 0, f + ' must be larger than zero bytes');
  }
});

test('fonts: OFL.txt contains the license header', () => {
  const text = readFileSync(path.join(root, 'fonts/OFL.txt'), 'utf8');
  assert.ok(text.includes('SIL OPEN FONT LICENSE'), 'OFL.txt must contain SIL OPEN FONT LICENSE');
});

test('toolchain: node version is at least v18', () => {
  const out = execFileSync(process.execPath, ['--version'], { encoding: 'utf8' }).trim();
  const major = Number(out.replace(/^v/, '').split('.')[0]);
  assert.ok(major >= 18, 'node --version must be at least v18, got ' + out);
});

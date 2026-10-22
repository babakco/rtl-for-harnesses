/**
 * bundle.mjs — macOS `.app` bundle surgery for the RTL copy.
 *
 * These are the steps that cannot live in the asar: the bundle id, display
 * name, deep-link scheme, the `ElectronAsarIntegrity` hash, the Electron helper
 * bundle names (Electron looks them up as `<outer name> Helper*.app`) and the
 * ad-hoc re-signature that a modified bundle needs to launch at all.
 *
 * Every external command is a fixed macOS utility (`ditto`, `codesign`, `xattr`,
 * `/usr/libexec/PlistBuddy`) invoked with an argument array — never a shell — so
 * paths containing spaces or quotes cannot be mangled.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Run a command, returning trimmed stdout; throws with stderr on failure. */
export function run(command, args, options = {}) {
  try {
    const stdout = execFileSync(command, args, { encoding: 'utf8', ...options });
    // `stdio: 'inherit'` gives no captured output, so stdout is null there.
    return stdout == null ? '' : stdout.trim();
  } catch (error) {
    const stderr = (error.stderr || '').toString().trim();
    const stdout = (error.stdout || '').toString().trim();
    const detail = stderr || stdout || error.message;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

export function hasCommand(command) {
  try {
    execFileSync('/usr/bin/which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/* ── Info.plist ─────────────────────────────────────────────────────────── */

export function readPlist(plistPath, key) {
  try {
    return run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath]);
  } catch {
    return null;
  }
}

/** Set a plist key, adding it when it does not exist yet. */
export function setPlist(plistPath, key, value) {
  try {
    run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath]);
  } catch {
    run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plistPath]);
  }
}

/* ── bundle copy ────────────────────────────────────────────────────────── */

/**
 * Copy a bundle. `ditto` preserves the resource forks, ACLs and signature
 * metadata that a naive recursive copy drops, and is dramatically faster on a
 * 700 MB Electron bundle.
 */
export function copyBundle(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (hasCommand('ditto')) {
    run('ditto', [src, dest], { stdio: 'inherit' });
  } else {
    fs.cpSync(src, dest, { recursive: true, preserveTimestamps: true });
  }
}

/* ── Electron helpers ───────────────────────────────────────────────────── */

/**
 * Electron locates its helper bundles as `<outer bundle name> Helper*.app`
 * inside `Contents/Frameworks`. Renaming only the outer bundle breaks that
 * lookup and the process dies with "Unable to find helper app", so the helper
 * directories, their executables and their `CFBundleExecutable` must move
 * together.
 *
 * @returns {string[]} the helper bundle names that were renamed
 */
export function renameHelpers(appDir, oldBase, newBase, bundleId) {
  const frameworks = path.join(appDir, 'Contents', 'Frameworks');
  if (!fs.existsSync(frameworks)) return [];
  const renamed = [];

  for (const name of fs.readdirSync(frameworks)) {
    if (!name.startsWith(`${oldBase}`) || !name.endsWith('.app')) continue;
    const suffix = name.slice(oldBase.length, -'.app'.length); // "", " (GPU)", …
    const from = path.join(frameworks, name);
    const to = path.join(frameworks, `${newBase}${suffix}.app`);

    fs.renameSync(from, to); // move the bundle first, then the executable in it

    const macos = path.join(to, 'Contents', 'MacOS');
    const oldExe = path.join(macos, `${oldBase}${suffix}`);
    const newExe = path.join(macos, `${newBase}${suffix}`);
    if (fs.existsSync(oldExe)) fs.renameSync(oldExe, newExe);

    const plist = path.join(to, 'Contents', 'Info.plist');
    if (fs.existsSync(plist)) {
      setPlist(plist, 'CFBundleExecutable', `${newBase}${suffix}`);
      setPlist(plist, 'CFBundleDisplayName', `${newBase}${suffix}`);
      setPlist(plist, 'CFBundleName', `${newBase}${suffix}`);
      setPlist(plist, 'CFBundleIdentifier', `${bundleId}.helper${suffix.replace(/[^A-Za-z0-9]/g, '')}`);
    }
    renamed.push(`${newBase}${suffix}.app`);
  }
  return renamed;
}

/* ── Electron fuses ─────────────────────────────────────────────────────── */

const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');

/** Index of `EnableEmbeddedAsarIntegrityValidation` in the FuseV1 wire. */
export const FUSE_ENABLE_ASAR_INTEGRITY = 4;

function electronFrameworkBinary(appDir) {
  const fw = path.join(appDir, 'Contents', 'Frameworks', 'Electron Framework.framework');
  const candidates = [
    path.join(fw, 'Versions', 'A', 'Electron Framework'),
    path.join(fw, 'Electron Framework'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/**
 * Read the `__ELECTRON_FUSES` wire baked into the Electron Framework binary.
 *
 * The wire is `<32-byte sentinel><version byte><length byte><length state
 * bytes>`, each state byte ASCII `0`/`1`. When
 * `EnableEmbeddedAsarIntegrityValidation` is `0` (the state ZCode ships),
 * Electron never validates `ElectronAsarIntegrity`, so the plist hash is
 * advisory. This is worth reporting rather than guessing at.
 *
 * @returns {{version: number, length: number, states: string} | null}
 */
export function readFuseWire(appDir) {
  const binary = electronFrameworkBinary(appDir);
  if (!binary) return null;
  const fd = fs.openSync(binary, 'r');
  try {
    const chunk = 4 * 1024 * 1024;
    const overlap = FUSE_SENTINEL.length - 1;
    const buf = Buffer.allocUnsafe(chunk + overlap);
    const size = fs.fstatSync(fd).size;
    for (let pos = 0; pos < size; pos += chunk) {
      const len = Math.min(chunk + overlap, size - pos);
      const read = fs.readSync(fd, buf, 0, len, pos);
      const at = buf.subarray(0, read).indexOf(FUSE_SENTINEL);
      if (at === -1) continue;
      const header = Buffer.allocUnsafe(2);
      fs.readSync(fd, header, 0, 2, pos + at + FUSE_SENTINEL.length);
      const version = header[0];
      const length = header[1];
      const states = Buffer.allocUnsafe(length);
      fs.readSync(fd, states, 0, length, pos + at + FUSE_SENTINEL.length + 2);
      return { version, length, states: states.toString('latin1') };
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/* ── signing ────────────────────────────────────────────────────────────── */

/**
 * Ad-hoc re-sign a modified bundle, preserving the original entitlements.
 * Electron needs `allow-jit` and `disable-library-validation` to start, and
 * macOS refuses to run a bundle whose signature no longer matches its contents.
 */
export function signBundle(appDir, sourceApp, entitlementsFile) {
  let entitlements = entitlementsFile;
  try {
    const xml = execFileSync('codesign', ['-d', '--entitlements', '-', '--xml', sourceApp], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    fs.mkdirSync(path.dirname(entitlements), { recursive: true });
    fs.writeFileSync(entitlements, xml.replace(/^.*?<\?xml/s, '<?xml'));
  } catch {
    fs.mkdirSync(path.dirname(entitlements), { recursive: true });
    fs.writeFileSync(
      entitlements,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
`,
    );
  }

  fs.rmSync(path.join(appDir, 'Contents', '_CodeSignature'), { recursive: true, force: true });
  run('codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--entitlements',
    entitlements,
    '--options',
    'runtime',
    appDir,
  ]);

  try {
    run('codesign', ['--verify', '--deep', '--strict', appDir]);
  } catch (error) {
    return { verified: false, warning: error.message };
  }
  run('xattr', ['-cr', appDir]);
  return { verified: true, entitlements };
}

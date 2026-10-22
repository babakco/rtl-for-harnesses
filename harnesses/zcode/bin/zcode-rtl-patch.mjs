#!/usr/bin/env node
/**
 * zcode-rtl-patch — build `ZCode-RTL.app` from the installed `ZCode.app`.
 *
 * The RTL copy is always rebuilt from the pristine original, so running this
 * again after the original updates is all that is required: the source app is
 * never touched, and the output is a deterministic function of the source plus
 * the payload in this repository.
 *
 *   zcode-rtl-patch                  patch and install to /Applications
 *   zcode-rtl-patch --dry-run        report exactly what would change, write nothing
 *   zcode-rtl-patch --no-install     build into ./build and stop
 *   zcode-rtl-patch --inspect        dump the source archive's RTL-relevant facts
 *   zcode-rtl-patch --rebuild-font   regenerate the bundled Vazirmatn WOFF2 first
 *
 * Options: --source <app> --dest <app> --keep-stage
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readAsar, closeAsar, rewriteAsar, headerDigestFromJson } from '../src/asar.mjs';
import { planEdits, RTL_CSS, RTL_JS, RTL_FONT, rendererDocuments } from '../src/patch-app.mjs';
import {
  copyBundle,
  hasCommand,
  readFuseWire,
  readPlist,
  renameHelpers,
  run,
  setPlist,
  signBundle,
  FUSE_ENABLE_ASAR_INTEGRITY,
} from '../src/bundle.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(HERE, 'build');
const STAGE = path.join(BUILD, 'stage');
const SKIP_WALK = new Set(['build', 'node_modules', '.git', '.freebuff']);

const c = {
  ok: (s) => `\u001b[1;36m==>\u001b[0m ${s}`,
  warn: (s) => `\u001b[1;33m[!]\u001b[0m ${s}`,
  die: (s) => `\u001b[1;31m[x]\u001b[0m ${s}`,
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
};

function parseArgs(argv) {
  const opts = {
    source: '/Applications/ZCode.app',
    dest: '/Applications/ZCode-RTL.app',
    install: true,
    dryRun: false,
    inspect: false,
    rebuildFont: false,
    keepStage: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      return value;
    };
    switch (arg) {
      case '--source': opts.source = path.resolve(next()); break;
      case '--dest': opts.dest = path.resolve(next()); break;
      case '--no-install': opts.install = false; break;
      case '--dry-run': opts.dryRun = true; opts.install = false; break;
      case '--inspect': opts.inspect = true; break;
      case '--rebuild-font': opts.rebuildFont = true; break;
      case '--keep-stage': opts.keepStage = true; break;
      case '--json': opts.json = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      default: throw new Error(`unknown option: ${arg}`);
    }
  }
  return opts;
}

/* The repository's `runtime/` directory mirrors the in-archive layout of
   `out/renderer/`, so the CSS's relative `./fonts/…` URL works in both. */
const payloadPaths = () => ({
  css: path.join(HERE, 'runtime', 'rtl.css'),
  js: path.join(HERE, 'runtime', 'rtl.js'),
  font: path.join(HERE, 'runtime', 'fonts', 'vazirmatn-var.woff2'),
});

function walkFiles(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (base === HERE && SKIP_WALK.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) walkFiles(full, base, out);
    else out.push(path.relative(HERE, full));
  }
  return out;
}

function readPayload() {
  const p = payloadPaths();
  for (const key of Object.keys(p)) {
    if (!fs.existsSync(p[key])) {
      throw new Error(`missing payload file ${p[key]}; run \`git lfs\`/vendor step or --rebuild-font`);
    }
  }
  return { css: fs.readFileSync(p.css), js: fs.readFileSync(p.js), font: fs.readFileSync(p.font) };
}

function rebuildFont() {
  const sources = [
    path.join(process.env.HOME || '', 'Library/Fonts/Vazirmatn[wght].ttf'),
    '/Library/Fonts/Vazirmatn[wght].ttf',
  ];
  const ttf = sources.find((candidate) => fs.existsSync(candidate));
  if (!ttf) return { rebuilt: false, reason: 'Vazirmatn variable TTF not found on this system' };
  const dest = payloadPaths().font;
  try {
    run('python3', [path.join(HERE, 'tools', 'make-font.py'), ttf, dest]);
    return { rebuilt: true, from: ttf, bytes: fs.statSync(dest).size };
  } catch (error) {
    return { rebuilt: false, reason: error.message };
  }
}

function inspect(source, sourceAsar, fuse) {
  const handle = readAsar(sourceAsar);
  try {
    const docs = rendererDocuments(handle);
    const facts = {
      app: source,
      bundleId: readPlist(path.join(source, 'Contents', 'Info.plist'), 'CFBundleIdentifier'),
      version: readPlist(path.join(source, 'Contents', 'Info.plist'), 'CFBundleShortVersionString'),
      build: readPlist(path.join(source, 'Contents', 'Info.plist'), 'CFBundleVersion'),
      name: readPlist(path.join(source, 'Contents', 'Info.plist'), 'CFBundleName'),
      plistAsarHash: readPlist(
        path.join(source, 'Contents', 'Info.plist'),
        'ElectronAsarIntegrity:Resources/app.asar:hash',
      ),
      headerDigest: headerDigestFromJson(handle.jsonBuf),
      asarBytes: handle.fileSize,
      jsonLen: handle.jsonLen,
      dataStart: handle.dataStart,
      rendererDocuments: docs,
      fuse: fuse && {
        version: fuse.version,
        count: fuse.length,
        states: fuse.states,
        asarIntegrityValidation: fuse.states[FUSE_ENABLE_ASAR_INTEGRITY] === '1',
      },
    };
    return facts;
  } finally {
    closeAsar(handle);
  }
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, '') + '\n');
    return 0;
  }

  if (process.platform !== 'darwin') throw new Error('this patcher targets macOS app bundles');

  const info = path.join(opts.source, 'Contents', 'Info.plist');
  const sourceAsar = path.join(opts.source, 'Contents', 'Resources', 'app.asar');
  if (!fs.existsSync(sourceAsar)) throw new Error(`source archive not found: ${sourceAsar}`);

  const sourceName = readPlist(info, 'CFBundleName') || 'ZCode';
  const version = readPlist(info, 'CFBundleShortVersionString') || 'unknown';
  const destName = path.basename(opts.dest, '.app');
  const bundleId = `${readPlist(info, 'CFBundleIdentifier') || 'dev.zcode.app'}.rtl`;
  const fuse = readFuseWire(opts.source);

  if (opts.inspect) {
    process.stdout.write(JSON.stringify(inspect(opts.source, sourceAsar, fuse), null, 2) + '\n');
    return 0;
  }

  process.stdout.write(c.ok(`source          : ${opts.source} (${sourceName} ${version})`) + '\n');
  process.stdout.write(c.ok(`destination     : ${opts.install ? opts.dest : `${STAGE}/${destName}.app (not installed)`}`) + '\n');
  if (fuse) {
    const enabled = fuse.states[FUSE_ENABLE_ASAR_INTEGRITY] === '1';
    process.stdout.write(
      c.ok(`asar integrity  : fuse ${enabled ? 'ENABLED' : 'DISABLED'} (wire ${fuse.states})`) + '\n',
    );
  }

  const payload = readPayload();
  if (opts.rebuildFont && !opts.dryRun) {
    const font = rebuildFont();
    process.stdout.write(
      font.rebuilt ? c.ok(`font            : rebuilt from ${font.from}`) : c.warn(`font            : ${font.reason}`),
    );
    process.stdout.write('\n');
    if (font.rebuilt) Object.assign(payload, readPayload());
  }

  /* ── dry run: plan against the source archive, touch nothing ───────────── */
  if (opts.dryRun) {
    const handle = readAsar(sourceAsar);
    let plan;
    try {
      plan = planEdits(handle, payload);
    } finally {
      closeAsar(handle);
    }
    const report = {
      dryRun: true,
      source: sourceAsar,
      version,
      changed: plan.changed,
      alreadyPatched: plan.unchanged,
      notes: plan.skipped,
      replace: [...plan.replace.keys()],
      add: [...plan.add.keys()],
      bytes: [...plan.replace, ...plan.add].map(([p, b]) => ({ path: p, bytes: b.length })),
      bundle: {
        bundleId,
        destName,
        scheme: `${(readPlist(info, 'CFBundleURLTypes:0:CFBundleURLSchemes:0') || 'zcode')}-rtl`,
        removeAppUpdateYml: fs.existsSync(path.join(opts.source, 'Contents', 'Resources', 'app-update.yml')),
        renameHelpersTo: `${destName} Helper`,
      },
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return 0;
  }

  for (const command of ['codesign', 'ditto', 'xattr']) {
    if (!hasCommand(command)) throw new Error(`required macOS command not found: ${command}`);
  }

  /* ── 1. clean stage + copy the pristine bundle ─────────────────────────── */
  fs.rmSync(STAGE, { recursive: true, force: true });
  const stagedApp = path.join(STAGE, `${destName}.app`);
  process.stdout.write(c.ok(`copying bundle (~${Math.round(fs.statSync(sourceAsar).size / 1e6)} MB archive)`) + '\n');
  copyBundle(opts.source, stagedApp);

  /* ── 2. patch the staged copy's app.asar ───────────────────────────────── */
  const stagedAsar = path.join(stagedApp, 'Contents', 'Resources', 'app.asar');
  const handle = readAsar(stagedAsar);
  let plan;
  try {
    plan = planEdits(handle, payload);
  } finally {
    closeAsar(handle);
  }
  if (plan.changed.length === 0 && plan.add.size === 0) {
    throw new Error('nothing to patch: every renderer document already carries the payload');
  }
  const result = await rewriteAsar(stagedAsar, { replace: plan.replace, add: plan.add });
  process.stdout.write(
    c.ok(
      `app.asar        : ${plan.changed.length} document(s) + ${plan.add.size + plan.replace.size - plan.changed.length} asset(s)`,
    ) +
      `\n${c.dim(`    header sha256 ${result.headerDigest}`)}\n`,
  );

  /* ── 3. Info.plist ─────────────────────────────────────────────────────── */
  const stagedInfo = path.join(stagedApp, 'Contents', 'Info.plist');
  const resources = path.join(stagedApp, 'Contents', 'Resources');
  const scheme = `${readPlist(info, 'CFBundleURLTypes:0:CFBundleURLSchemes:0') || 'zcode'}-rtl`;
  setPlist(stagedInfo, 'CFBundleIdentifier', bundleId);
  setPlist(stagedInfo, 'CFBundleName', destName);
  setPlist(stagedInfo, 'CFBundleDisplayName', destName);
  setPlist(stagedInfo, 'CFBundleURLTypes:0:CFBundleURLName', destName);
  setPlist(stagedInfo, 'CFBundleURLTypes:0:CFBundleURLSchemes:0', scheme);
  setPlist(stagedInfo, 'ElectronAsarIntegrity:Resources/app.asar:algorithm', 'SHA256');
  setPlist(stagedInfo, 'ElectronAsarIntegrity:Resources/app.asar:hash', result.headerDigest);
  process.stdout.write(c.ok(`Info.plist      : ${bundleId}, scheme ${scheme}`) + '\n');

  /* ── 4. disable the self-updater ───────────────────────────────────────── */
  const updateYml = path.join(resources, 'app-update.yml');
  if (fs.existsSync(updateYml)) {
    fs.rmSync(updateYml);
    process.stdout.write(c.ok('auto-update     : disabled (removed app-update.yml)') + '\n');
  }

  /* ── 5. rename Electron helpers to match the new bundle name ───────────── */
  const renamed = renameHelpers(stagedApp, `${sourceName} Helper`, `${destName} Helper`, bundleId);
  process.stdout.write(
    renamed.length
      ? c.ok(`helpers         : renamed ${renamed.length} (${renamed.join(', ')})`) + '\n'
      : c.warn('helpers         : none found — is this still an Electron app?') + '\n',
  );

  /* ── 6. ad-hoc re-sign ─────────────────────────────────────────────────── */
  const signing = signBundle(stagedApp, opts.source, path.join(BUILD, 'entitlements.plist'));
  process.stdout.write(
    (signing.verified ? c.ok : c.warn)(
      `codesign        : ad-hoc signed${signing.verified ? ' and verified' : ` (verify: ${signing.warning})`}`,
    ) + '\n',
  );

  /* ── 7. install ────────────────────────────────────────────────────────── */
  if (opts.install) {
    if (fs.existsSync(opts.dest)) {
      try {
        run('pkill', ['-f', `${opts.dest}/Contents/MacOS`]);
      } catch {
        /* nothing was running */
      }
      fs.rmSync(opts.dest, { recursive: true, force: true });
    }
    copyBundle(stagedApp, opts.dest);
    process.stdout.write(c.ok(`installed       : ${opts.dest}`) + '\n');
    if (!opts.keepStage) fs.rmSync(STAGE, { recursive: true, force: true });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: opts.source,
    sourceVersion: version,
    destination: opts.install ? opts.dest : stagedApp,
    bundleId,
    scheme,
    headerDigest: result.headerDigest,
    asarIntegrityFuseEnabled: fuse ? fuse.states[FUSE_ENABLE_ASAR_INTEGRITY] === '1' : null,
    bytesIn: result.bytesIn,
    bytesOut: result.bytesOut,
    documents: plan.changed,
    assets: [RTL_CSS, RTL_JS, RTL_FONT],
    helpers: renamed,
    payload: walkFiles(HERE).filter((file) => file.startsWith('runtime/')),
  };
  fs.mkdirSync(BUILD, { recursive: true });
  fs.writeFileSync(path.join(BUILD, 'patch-report.json'), JSON.stringify(report, null, 2) + '\n');
  if (opts.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    process.stdout.write(
      '\n' +
        c.ok('done') +
        `\n\n    Launch:  open -a "${destName}"\n` +
        `    The original "${sourceName}" is untouched. Update it, then re-run this script.\n`,
    );
  }
  return 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(c.die(error && error.stack ? error.stack : String(error)) + '\n');
    process.exit(1);
  });

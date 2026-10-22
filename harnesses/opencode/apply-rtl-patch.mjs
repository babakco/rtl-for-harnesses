#!/usr/bin/env node

import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

const DEFAULT_APP = "/Applications/OpenCode.app"
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PATCHER = path.join(SCRIPT_DIR, "rtl-patch-official.mjs")
const NPM_EXEC = process.platform === "win32" ? "npx.cmd" : "npx"
const BUNDLE_ID = "ai.opencode.desktop"
const RTL2_BUNDLE_ID = "ai.opencode.desktop.rtl2"
const RTL2_NAME = "OpenCode-RTL-2"
const RELEASE_API_BASE = "https://api.github.com/repos/sst/opencode/releases"
const MAC_ARM64_ASSET = "opencode-desktop-mac-arm64.zip"
const V2_FEED_BASE = "https://opencode.ai/update/api/latest/desktop/opencode"
const V2_ZIP_BASE = "https://opencode.ai/files/bin"

try {
  await main()
} catch (error) {
  console.error(`RTL patch failed: ${error.message}`)
  process.exitCode = 1
}

async function main() {
  if (process.platform !== "darwin") throw new Error("This app wrapper currently supports macOS only")

  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }
  if (options.update && options.version) throw new Error("--update and --version are mutually exclusive")
  if (!fs.existsSync(PATCHER)) throw new Error(`Missing patcher: ${PATCHER}`)

  const appPath = path.resolve(options.appPath)
  const infoPath = path.join(appPath, "Contents", "Info.plist")
  const currentAsar = path.join(appPath, "Contents", "Resources", "app.asar")
  const appName = path.basename(appPath, ".app")
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-rtl-"))

  if (options.check) {
    try {
      await printUpdateStatus(appPath)
    } finally {
      if (!options.keepTemp && fs.existsSync(workspace)) fs.rmSync(workspace, { recursive: true, force: true })
    }
    return
  }

  const appExisted = fs.existsSync(appPath) && fs.statSync(appPath).isDirectory()
  let installedVersion = null
  if (appExisted && fs.existsSync(infoPath)) {
    try {
      installedVersion = readPlistString(fs.readFileSync(infoPath, "utf8"), "CFBundleShortVersionString")
    } catch {
      installedVersion = null
    }
  }

  let release = null
  if (options.version) {
    release = /^1\./.test(options.version)
      ? await resolveRelease(options.version)
      : await resolveReleaseV2(options.version)
    console.log(`Pinned release: ${release.tag}`)
  } else if (options.update) {
    release = installedVersion?.startsWith("1.") ? await resolveRelease(null) : await resolveReleaseV2(null)
    console.log(`Newest upstream release: ${release.tag}`)
  }

  if (!appExisted && !release) throw new Error(`App not found: ${appPath}`)

  const rtlAppPath = options.rtlApp ? path.resolve(options.rtlApp) : null
  if (rtlAppPath === appPath) throw new Error("--rtl-app must differ from --app")
  const rtl2AppPath = options.rtl2App ? path.resolve(options.rtl2App) : null
  if (rtl2AppPath === appPath) throw new Error("--rtl2-app must differ from --app")
  if (rtl2AppPath && rtlAppPath && rtl2AppPath === rtlAppPath) throw new Error("--rtl2-app must differ from --rtl-app")

  let supersededApp
  let supersededMoved = false
  if (release) {
    if (installedVersion === release.version) {
      console.log(`Already on ${release.version}; re-applying patch.`)
      ensureOfficialBackup(appPath, appName, release.version, workspace)
    } else {
      console.log(
        appExisted ? `Updating ${installedVersion} → ${release.version}...` : `Installing ${release.version}...`,
      )
      supersededApp = await installOfficialApp(appPath, appName, release, workspace)
      supersededMoved = supersededApp !== undefined
    }
  }

  if (!fs.existsSync(appPath) || !fs.statSync(appPath).isDirectory()) throw new Error(`App not found: ${appPath}`)
  if (!fs.existsSync(infoPath)) throw new Error(`Missing Info.plist: ${infoPath}`)
  if (!fs.existsSync(currentAsar)) throw new Error(`Missing app.asar: ${currentAsar}`)

  const currentPlist = fs.readFileSync(infoPath, "utf8")
  const version = readPlistString(currentPlist, "CFBundleShortVersionString")
  const bundleId = readPlistString(currentPlist, "CFBundleIdentifier")
  if (bundleId !== BUNDLE_ID) throw new Error(`Unexpected bundle identifier: ${bundleId}`)
  if (release && version !== release.version) {
    throw new Error(`Installed version ${version} does not match requested ${release.version}`)
  }

  const backupPath = path.join(path.dirname(appPath), `${appName}-original-v${version}.app`)
  if (!fs.existsSync(backupPath)) {
    const probe = path.join(workspace, "current-probe")
    runAsar("extract", currentAsar, probe)
    if (looksPatched(probe)) {
      throw new Error(`Refusing to create a backup from an already patched app: ${appPath}`)
    }
    verifyOfficialApp(appPath, version)
    console.log(`Creating untouched backup: ${backupPath}`)
    run("ditto", [appPath, backupPath])
  }

  verifyBackup(backupPath, version, bundleId)

  const targets = []
  if (!rtlAppPath && !rtl2AppPath) targets.push({ targetPath: appPath, variant: "rtl" })
  if (rtlAppPath) targets.push({ targetPath: rtlAppPath, variant: "rtl" })
  if (rtl2AppPath) targets.push({ targetPath: rtl2AppPath, variant: "rtl2" })

  let completed = false
  try {
    for (const requested of targets) {
      const integrityHash = await buildVariantTarget({
        targetPath: requested.targetPath,
        variant: requested.variant,
        appPath,
        backupPath,
        version,
        bundleId,
        workspace,
        keepTemp: options.keepTemp,
      })
      if (requested.targetPath !== appPath) {
        console.log(`Official app (untouched): ${appPath} (${version})`)
        console.log(
          `${requested.variant === "rtl2" ? "RTL-2" : "RTL"} app: ${requested.targetPath} (${version}, ${integrityHash})`,
        )
      }
    }
    completed = true
    if (supersededApp && fs.existsSync(supersededApp)) fs.rmSync(supersededApp, { recursive: true, force: true })
  } finally {
    if (!completed && supersededMoved && supersededApp && fs.existsSync(supersededApp)) {
      if (fs.existsSync(appPath)) fs.rmSync(appPath, { recursive: true, force: true })
      fs.renameSync(supersededApp, appPath)
    }
    if (completed && supersededApp && fs.existsSync(supersededApp)) {
      fs.rmSync(supersededApp, { recursive: true, force: true })
    }
    if (!options.keepTemp && fs.existsSync(workspace)) fs.rmSync(workspace, { recursive: true, force: true })
  }
}

async function buildPatchedApp({ targetPath, backupPath, version, bundleId, workspace, keepTemp, variant = "rtl" }) {
  const targetInfo = path.join(targetPath, "Contents", "Info.plist")
  const targetAsar = path.join(targetPath, "Contents", "Resources", "app.asar")
  const targetName = path.basename(targetPath, ".app")
  const targetPlist = fs.readFileSync(targetInfo, "utf8")
  if (readPlistString(targetPlist, "CFBundleShortVersionString") !== version) {
    throw new Error(`Target version mismatch at ${targetPath}: expected ${version}`)
  }
  if (readPlistString(targetPlist, "CFBundleIdentifier") !== bundleId) {
    throw new Error(`Target bundle identifier mismatch at ${targetPath}`)
  }

  let stageRoot
  let previousApp
  let oldAppMoved = false
  let newAppMoved = false
  let swapCompleted = false

  try {
    const unpacked = path.join(workspace, "unpacked")
    const packed = path.join(workspace, "app.asar")
    const backupAsar = path.join(backupPath, "Contents", "Resources", "app.asar")
    runAsar("extract", backupAsar, unpacked)
    run(process.execPath, [PATCHER, unpacked, ...(variant === "rtl2" ? ["--rtl2"] : [])])
    assertPatched(unpacked, variant)
    runAsar("pack", unpacked, packed)

    const integrityHash = readAsarHeaderHash(packed)
    stageRoot = fs.mkdtempSync(path.join(path.dirname(targetPath), `.${targetName}-rtl-`))
    const stagedApp = path.join(stageRoot, `${targetName}.app`)
    run("ditto", [backupPath, stagedApp])

    const stagedAsar = path.join(stagedApp, "Contents", "Resources", "app.asar")
    const stagedInfo = path.join(stagedApp, "Contents", "Info.plist")
    fs.copyFileSync(packed, stagedAsar)
    let stagedPlist = updateAsarIntegrity(fs.readFileSync(stagedInfo, "utf8"), integrityHash)
    if (variant === "rtl2") {
      stagedPlist = applyRtl2Identity(stagedPlist)
      applyRtl2Helpers(stagedApp)
      applyRtl2Icon(stagedApp, workspace)
    }
    fs.writeFileSync(stagedInfo, stagedPlist)
    verifyVariantPlist(stagedPlist, version, bundleId, integrityHash, variant)

    run("codesign", ["--force", "--deep", "--sign", "-", stagedApp])
    run("codesign", ["--verify", "--deep", "--strict", stagedApp])

    previousApp = makeUnusedSibling(path.dirname(targetPath), `.${targetName}-previous-`, ".app")
    fs.renameSync(targetPath, previousApp)
    oldAppMoved = true
    fs.renameSync(stagedApp, targetPath)
    newAppMoved = true

    const finalPlist = fs.readFileSync(targetInfo, "utf8")
    verifyVariantPlist(finalPlist, version, bundleId, integrityHash, variant)
    if (readAsarHeaderHash(targetAsar) !== integrityHash) throw new Error("Installed app.asar integrity hash mismatch")
    run("codesign", ["--verify", "--deep", "--strict", targetPath])
    swapCompleted = true
    fs.rmSync(previousApp, { recursive: true, force: true })

    console.log(`Applied ${variant === "rtl2" ? "RTL-2" : "RTL"} patch to ${targetPath}`)
    console.log(`Version: ${version}`)
    console.log(`Untouched backup: ${backupPath}`)
    console.log(`ElectronAsarIntegrity: ${integrityHash}`)
    if (keepTemp) console.log(`Temporary workspace kept: ${workspace}`)
    return integrityHash
  } finally {
    if (oldAppMoved && !swapCompleted && newAppMoved && fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true })
    }
    if (oldAppMoved && !swapCompleted && !fs.existsSync(targetPath) && fs.existsSync(previousApp)) {
      fs.renameSync(previousApp, targetPath)
    }
    if (swapCompleted && previousApp && fs.existsSync(previousApp)) {
      fs.rmSync(previousApp, { recursive: true, force: true })
    }
    if (stageRoot && !keepTemp && fs.existsSync(stageRoot)) {
      fs.rmSync(stageRoot, { recursive: true, force: true })
    }
  }
}

async function buildVariantTarget({ targetPath, variant, appPath, backupPath, version, bundleId, workspace, keepTemp }) {
  if (targetPath === appPath) {
    return buildPatchedApp({ targetPath, backupPath, version, bundleId, workspace, keepTemp, variant })
  }
  const label = variant === "rtl2" ? "RTL-2" : "RTL"
  const existed = fs.existsSync(targetPath)
  let previous
  let previousMoved = false
  let completed = false
  try {
    if (existed) {
      previous = makeUnusedSibling(path.dirname(targetPath), `.${path.basename(targetPath, ".app")}-superseded-`, ".app")
      fs.renameSync(targetPath, previous)
      previousMoved = true
    }
    console.log(`Creating pristine ${label} base: ${targetPath}`)
    run("ditto", [backupPath, targetPath])
    const integrityHash = await buildPatchedApp({ targetPath, backupPath, version, bundleId, workspace, keepTemp, variant })
    completed = true
    return integrityHash
  } finally {
    if (completed) {
      if (previous && fs.existsSync(previous)) fs.rmSync(previous, { recursive: true, force: true })
    } else if (previousMoved && previous && fs.existsSync(previous)) {
      if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true })
      fs.renameSync(previous, targetPath)
    } else if (!existed && fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true })
    }
  }
}

function applyRtl2Identity(plist) {
  if (readPlistString(plist, "CFBundleIdentifier") !== BUNDLE_ID) {
    throw new Error("RTL-2 identity requires the original bundle identifier")
  }
  let next = setPlistString(plist, "CFBundleIdentifier", RTL2_BUNDLE_ID)
  next = setPlistString(next, "CFBundleName", RTL2_NAME)
  next = setPlistString(next, "CFBundleDisplayName", RTL2_NAME)
  return next
}

function setPlistString(plist, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`(<key>${escapedKey}</key>\\s*<string>)[^<]*(</string>)`)
  const matches = [...plist.matchAll(new RegExp(pattern.source, "g"))]
  if (matches.length !== 1) throw new Error(`Expected one ${key} in Info.plist`)
  return plist.replace(pattern, `$1${value}$2`)
}

function applyRtl2Helpers(stagedApp) {
  const frameworks = path.join(stagedApp, "Contents", "Frameworks")
  if (!fs.existsSync(frameworks)) throw new Error("Missing Frameworks directory for RTL-2 helpers")
  const helperPrefix = "OpenCode Helper"
  const newPrefix = `${RTL2_NAME} Helper`
  let touched = 0
  for (const entry of fs.readdirSync(frameworks)) {
    if (!entry.endsWith(".app")) continue
    const helperDir = path.join(frameworks, entry)
    const infoPath = path.join(helperDir, "Contents", "Info.plist")
    if (!fs.existsSync(infoPath)) continue
    let plist = fs.readFileSync(infoPath, "utf8")
    if (!plist.includes(`<string>${BUNDLE_ID}.helper`)) continue

    plist = plist.split(`<string>${BUNDLE_ID}.helper`).join(`<string>${RTL2_BUNDLE_ID}.helper`)
    const executable = readPlistString(plist, "CFBundleExecutable")
    if (!executable.startsWith(helperPrefix)) throw new Error(`Unexpected helper executable: ${executable}`)
    const newExecutable = newPrefix + executable.slice(helperPrefix.length)
    plist = setPlistString(plist, "CFBundleExecutable", newExecutable)
    const displayName = readPlistString(plist, "CFBundleDisplayName")
    if (!displayName.startsWith(helperPrefix)) throw new Error(`Unexpected helper display name: ${displayName}`)
    plist = setPlistString(plist, "CFBundleDisplayName", newPrefix + displayName.slice(helperPrefix.length))
    fs.writeFileSync(infoPath, plist)

    const oldBinary = path.join(helperDir, "Contents", "MacOS", executable)
    const newBinary = path.join(helperDir, "Contents", "MacOS", newExecutable)
    if (!fs.existsSync(oldBinary)) throw new Error(`Missing helper executable: ${oldBinary}`)
    fs.renameSync(oldBinary, newBinary)

    const newDirName = newPrefix + entry.slice(helperPrefix.length)
    fs.renameSync(helperDir, path.join(frameworks, newDirName))
    if (!fs.existsSync(path.join(frameworks, newDirName, "Contents", "MacOS", newExecutable))) {
      throw new Error(`Helper rename failed: ${newDirName}`)
    }
    touched += 1
  }
  if (touched === 0) throw new Error("No RTL-2 helper bundles updated")
}

function applyRtl2Icon(stagedApp, workspace) {
  const iconPath = path.join(stagedApp, "Contents", "Resources", "icon.icns")
  if (!fs.existsSync(iconPath)) throw new Error("Missing icon.icns for the RTL-2 icon")
  const script = path.join(SCRIPT_DIR, "rtl2-icon.py")
  if (!fs.existsSync(script)) throw new Error(`Missing RTL-2 icon script: ${script}`)
  const output = path.join(workspace, "rtl2-icon.icns")
  run("python3", [script, iconPath, output])
  if (!fs.existsSync(output)) throw new Error("RTL-2 icon script produced no output")
  fs.copyFileSync(output, iconPath)
  console.log("Applied RTL-2 badge icon")
}

function verifyVariantPlist(plist, version, bundleId, integrityHash, variant) {
  const expected = variant === "rtl2" ? RTL2_BUNDLE_ID : bundleId
  verifyPlist(plist, version, expected, integrityHash)
  if (variant === "rtl2") {
    if (readPlistString(plist, "CFBundleName") !== RTL2_NAME) throw new Error("Info.plist RTL-2 name mismatch")
    if (readPlistString(plist, "CFBundleDisplayName") !== RTL2_NAME) throw new Error("Info.plist RTL-2 display name mismatch")
  }
}

function assertRtl2Isolation(unpacked) {
  const mainDir = path.join(unpacked, "out", "main")
  const indexText = fs.readFileSync(path.join(mainDir, "index.js"), "utf8")
  const desktop = fs
    .readdirSync(mainDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(mainDir, name))
    .find((file) => fs.readFileSync(file, "utf8").includes("RTL2_ISOLATION"))
  if (!desktop) throw new Error("Patch verification failed: RTL-2 isolation block missing")
  const desktopText = fs.readFileSync(desktop, "utf8")
  const base = `process.env.HOME+"/Library/Application Support/${RTL2_BUNDLE_ID}"`
  const checks = [
    ["rtl2 app id", indexText.includes("prod:`ai.opencode.desktop.rtl2`}")],
    ["rtl2 app id old gone", !indexText.includes("prod:`ai.opencode.desktop`}")],
    ["rtl2 app name", indexText.includes("prod:`OpenCode-RTL-2`}")],
    ["rtl2 marker", desktopText.includes('RTL2_ISOLATION:"v1"')],
    [
      "rtl2 process env",
      indexText.includes(
        'process.env.XDG_STATE_HOME||(process.env.XDG_STATE_HOME=process.env.HOME+"/Library/Application Support/ai.opencode.desktop.rtl2")',
      ),
    ],
    ["rtl2 service port", desktopText.includes("]:[`--port`,`49375`]]")],
    ["rtl2 state home", desktopText.includes(`XDG_STATE_HOME:process.env.XDG_STATE_HOME??${base},`)],
    ["rtl2 data home", desktopText.includes(`XDG_DATA_HOME:process.env.XDG_DATA_HOME??${base}+"/data",`)],
    ["rtl2 config home", desktopText.includes(`XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME??${base}+"/config",`)],
    ["rtl2 cache home", desktopText.includes(`XDG_CACHE_HOME:process.env.XDG_CACHE_HOME??${base}+"/cache",`)],
  ]
  const missing = checks.filter(([, present]) => !present).map(([label]) => label)
  if (missing.length > 0) throw new Error(`Patch verification failed: ${missing.join(", ")}`)
}

function ensureOfficialBackup(appPath, appName, version, workspace) {
  const backupPath = path.join(path.dirname(appPath), `${appName}-original-v${version}.app`)
  if (!fs.existsSync(backupPath)) {
    const probe = path.join(workspace, "official-probe")
    runAsar("extract", path.join(appPath, "Contents", "Resources", "app.asar"), probe)
    if (looksPatched(probe)) {
      throw new Error(`Refusing to create a backup from an already patched app: ${appPath}`)
    }
    verifyOfficialApp(appPath, version)
    console.log(`Creating untouched backup: ${backupPath}`)
    run("ditto", [appPath, backupPath])
  }
  verifyBackup(backupPath, version, BUNDLE_ID)
}

function parseArgs(args) {
  let appPath = process.env.OPENCODE_APP ?? DEFAULT_APP
  let positionalPath = false
  let keepTemp = false
  let help = false
  let update = false
  let check = false
  let version
  let rtlApp
  let rtl2App

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--help" || arg === "-h") {
      help = true
      continue
    }
    if (arg === "--keep-temp") {
      keepTemp = true
      continue
    }
    if (arg === "--update") {
      update = true
      continue
    }
    if (arg === "--check") {
      check = true
      continue
    }
    if (arg === "--version") {
      version = args[index + 1]
      if (!version) throw new Error("--version requires a value like 1.18.27")
      index += 1
      continue
    }
    if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length)
      if (!version) throw new Error("--version requires a value like 1.18.27")
      continue
    }
    if (arg === "--rtl-app") {
      rtlApp = args[index + 1]
      if (!rtlApp) throw new Error("--rtl-app requires a path")
      index += 1
      continue
    }
    if (arg.startsWith("--rtl-app=")) {
      rtlApp = arg.slice("--rtl-app=".length)
      if (!rtlApp) throw new Error("--rtl-app requires a path")
      continue
    }
    if (arg === "--rtl2-app") {
      rtl2App = args[index + 1]
      if (!rtl2App) throw new Error("--rtl2-app requires a path")
      index += 1
      continue
    }
    if (arg.startsWith("--rtl2-app=")) {
      rtl2App = arg.slice("--rtl2-app=".length)
      if (!rtl2App) throw new Error("--rtl2-app requires a path")
      continue
    }
    if (arg === "--app") {
      appPath = args[index + 1]
      if (!appPath) throw new Error("--app requires a path")
      index += 1
      continue
    }
    if (arg.startsWith("--app=")) {
      appPath = arg.slice("--app=".length)
      if (!appPath) throw new Error("--app requires a path")
      continue
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`)
    if (positionalPath) throw new Error("Only one app path may be provided")
    appPath = arg
    positionalPath = true
  }

  return { appPath, help, keepTemp, update, check, version, rtlApp, rtl2App }
}

function printUsage() {
  console.log(`Usage: node apply-rtl-patch.mjs [--app /Applications/OpenCode.app] [--update | --version X.Y.Z | --check] [--rtl-app /Applications/OpenCode-RTL.app] [--rtl2-app /Applications/OpenCode-RTL-2.app] [--keep-temp]

Patches the installed official OpenCode app from an untouched same-version backup,
updates ElectronAsarIntegrity, ad-hoc signs the staged app, and verifies the result.

  (no flags)         Patch the installed app as-is (offline-friendly).
  --update           Resolve the newest official release (v2 desktop feed on
                     opencode.ai; the v1 GitHub feed only for 1.x installs), download,
                     verify (feed sha512 when available + official Developer-ID
                     signature, never ad-hoc) and install it when the installed app
                     is older, then patch. Re-patches when current.
  --version X.Y.Z    Same as --update but pinned to version X.Y.Z (downgrades allowed).
  --check            Print installed vs newest official version and exit.
  --rtl-app PATH     Split layout: keep --app as the untouched official app and
                     build the patched copy at PATH (e.g. /Applications/OpenCode-RTL.app).
                     The official versioned backup is shared; no extra backup is made.
  --rtl2-app PATH    Build the independent RTL-2 variant at PATH (e.g.
                     /Applications/OpenCode-RTL-2.app): the same RTL patches plus
                     its own bundle id/name and isolated data/config/cache/state
                     under the app's own userData. Combine with --rtl-app to build
                     both in one run.
  --app PATH         Target a different app location (default /Applications/OpenCode.app,
                     overridable via OPENCODE_APP).
  --keep-temp        Retain temporary staging files for diagnosis.

Releases resolve from the v2 desktop feed on opencode.ai; the v1 GitHub feed is
used only for 1.x installs (set GH_TOKEN or GITHUB_TOKEN there for a higher API
rate limit). A missing untouched backup is created automatically from the
installed official app (Developer-ID signature required). RTL-2 also gets its
own badge icon via rtl2-icon.py (needs python3 with Pillow). Quit the target
apps before patching and relaunch them manually afterward.`)
}

function verifyBackup(backupPath, version, bundleId) {
  const infoPath = path.join(backupPath, "Contents", "Info.plist")
  const asarPath = path.join(backupPath, "Contents", "Resources", "app.asar")
  if (!fs.existsSync(infoPath) || !fs.existsSync(asarPath)) throw new Error(`Invalid backup app: ${backupPath}`)
  const plist = fs.readFileSync(infoPath, "utf8")
  verifyPlist(plist, version, bundleId)
}

function verifyPlist(plist, version, bundleId, integrityHash) {
  if (readPlistString(plist, "CFBundleShortVersionString") !== version) throw new Error("Info.plist version mismatch")
  if (readPlistString(plist, "CFBundleIdentifier") !== bundleId) throw new Error("Info.plist bundle identifier mismatch")
  if (integrityHash !== undefined && readAsarIntegrityString(plist) !== integrityHash) {
    throw new Error("Info.plist ElectronAsarIntegrity mismatch")
  }
}

function readPlistString(plist, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = plist.match(new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]*)</string>`))
  if (!match) throw new Error(`Missing ${key} in Info.plist`)
  return match[1]
}

function readAsarIntegrityString(plist) {
  const matches = [...plist.matchAll(/<key>ElectronAsarIntegrity<\/key>[\s\S]*?<key>Resources\/app\.asar<\/key>[\s\S]*?<key>hash<\/key>\s*<string>([^<]+)<\/string>/g)]
  if (matches.length !== 1) throw new Error("Expected one Resources/app.asar integrity entry")
  return matches[0][1]
}

function updateAsarIntegrity(plist, integrityHash) {
  const pattern = /(<key>ElectronAsarIntegrity<\/key>[\s\S]*?<key>Resources\/app\.asar<\/key>[\s\S]*?<key>hash<\/key>\s*<string>)[^<]+(<\/string>)/
  const matches = [...plist.matchAll(new RegExp(pattern.source, "g"))]
  if (matches.length !== 1) throw new Error("Expected one Resources/app.asar integrity entry")
  return plist.replace(pattern, `$1${integrityHash}$2`)
}

function readAsarHeaderHash(archivePath) {
  const fd = fs.openSync(archivePath, "r")
  try {
    const prefix = Buffer.alloc(16)
    readExactly(fd, prefix, 0)
    if (prefix.readUInt32LE(0) !== 4) throw new Error(`Invalid ASAR header: ${archivePath}`)
    const headerSize = prefix.readUInt32LE(4)
    const stringSize = prefix.readUInt32LE(12)
    if (stringSize <= 0 || stringSize + 8 > headerSize) throw new Error(`Invalid ASAR header string size: ${archivePath}`)
    const headerString = Buffer.alloc(stringSize)
    readExactly(fd, headerString, 16)
    return crypto.createHash("sha256").update(headerString).digest("hex")
  } finally {
    fs.closeSync(fd)
  }
}

function readExactly(fd, buffer, position) {
  let offset = 0
  while (offset < buffer.length) {
    const count = fs.readSync(fd, buffer, offset, buffer.length - offset, position + offset)
    if (count === 0) throw new Error("Unexpected end of ASAR header")
    offset += count
  }
}

function looksPatched(unpacked) {
  const assets = path.join(unpacked, "out", "renderer", "assets")
  if (!fs.existsSync(assets)) return false
  const names = fs.readdirSync(assets)
  const jsName = names.find((name) => /^main-.*\.js$/.test(name))
  const cssName = names.find((name) => /^main-.*\.css$/.test(name))
  if (!jsName || !cssName) return false
  const mainJs = fs.readFileSync(path.join(assets, jsName), "utf8")
  const css = fs.readFileSync(path.join(assets, cssName), "utf8")
  if (
    mainJs.includes("PROMPT_INPUT_RTL") ||
    mainJs.includes("MARKDOWN_RTL") ||
    mainJs.includes("QUESTION_RTL") ||
    mainJs.includes("DOCK_TEXT_RTL") ||
    mainJs.includes("V2_RTL_RUNTIME") ||
    css.includes('"Vazirmatn"') ||
    css.includes(":\"Vazirmatn\",")
  ) {
    return true
  }
  // v2 code-split: markers live in lazy chunks, so scan them too (bounded).
  for (const name of names) {
    if (!name.endsWith(".js") || name === jsName) continue
    try {
      const text = fs.readFileSync(path.join(assets, name), "utf8")
      if (text.includes("PROMPT_INPUT_RTL") || text.includes("V2_RTL_RUNTIME") || text.includes("DOCK_TEXT_RTL")) return true
    } catch {
      continue
    }
  }
  // RTL-2 isolation marker lives in the main-process bundle.
  const mainDir = path.join(unpacked, "out", "main")
  if (fs.existsSync(mainDir)) {
    for (const name of fs.readdirSync(mainDir)) {
      if (!name.endsWith(".js")) continue
      try {
        if (fs.readFileSync(path.join(mainDir, name), "utf8").includes("RTL2_ISOLATION")) return true
      } catch {
        continue
      }
    }
  }
  return false
}

function readAllChunks(assets) {
  const names = fs.readdirSync(assets)
  const jsName = names.find((name) => /^main-.*\.js$/.test(name))
  const cssName = names.find((name) => /^main-.*\.css$/.test(name))
  const mainJs = fs.readFileSync(path.join(assets, jsName), "utf8")
  const css = fs.readFileSync(path.join(assets, cssName), "utf8")
  let allJs = mainJs
  for (const name of names) {
    if (!name.endsWith(".js") || name === jsName) continue
    allJs += "\n" + fs.readFileSync(path.join(assets, name), "utf8")
  }
  return { mainJs, allJs, css }
}

function assertPatched(unpacked, variant = "rtl") {
  const assets = path.join(unpacked, "out", "renderer", "assets")
  const jsName = findAsset(assets, /^main-.*\.js$/)
  const cssName = findAsset(assets, /^main-.*\.css$/)
  const js = fs.readFileSync(path.join(assets, jsName), "utf8")
  const css = fs.readFileSync(path.join(assets, cssName), "utf8")
  const isV2 = js.includes("__vite__mapDeps") || !js.includes("function PromptInputV2(props) {")
  if (isV2) {
    assertPatchedV2(assets, js, css)
    if (variant === "rtl2") assertRtl2Isolation(unpacked)
    return
  }
  const checks = [
    ["prompt direction", js.includes("PROMPT_INPUT_RTL") && js.includes("applyPromptInputV2Direction(element2)")],
    ["prompt 16px", js.includes("text-[16px] font-sans font-[440]", js.indexOf("data-component=prompt-input"))],
    ["prompt inline size", js.includes("style=font-size:16px;text-align:start")],
    ["prompt placeholder size", js.includes('<div style="font-size:16px;"')],
    ["prompt composer pin", css.includes('form[data-component="prompt-input-v2"] [data-component="prompt-input"]')],
    ["markdown direction", js.includes("MARKDOWN_RTL") && js.includes("applyMarkdownDirections(container)")],
    ["document direction", js.includes("DOCUMENT_EXTENSIONS") && js.includes("data-document")],
    ["message direction", js.includes("MESSAGE_RTL")],
    ["dock text direction", js.includes("DOCK_TEXT_RTL") && js.includes("applyDockTextDirections(document)")],
    ["dock text observer", js.includes("dockTextDirectionObserver") && js.includes("session-todo-dock")],
    [
      "question text alignment",
      cssBlockIncludes(css, '[data-component="dock-prompt"][data-kind="question"] [data-slot="question-text"]', "text-align: start;"),
    ],
    [
      "question option alignment",
      cssBlockIncludes(css, '[data-component="dock-prompt"][data-kind="question"] [data-slot="question-option"]', "text-align: start;"),
    ],
    [
      "question answer alignment",
      cssBlockIncludes(css, '[data-component="question-answers"] [data-slot="question-answer-item"] [data-slot="answer-text"]', "text-align: start;"),
    ],
    ["question textarea pin", css.includes('textarea[data-slot="question-custom-input"]{text-align:start}')],
    [
      "todo content alignment",
      cssBlockIncludes(css, '[data-component="todos"] [data-slot="message-part-todo-content"]', "text-align: start;"),
    ],
    ["todo dock pin", css.includes('[data-slot="session-todo-preview"],[data-slot="session-todo-list"]{text-align:start}')],
    ["pierre doc direction", js.includes("observePierreDocViewers") && js.includes("diffs-container")],
    [
      "pierre doc scope",
      js.includes("pierreDocScopeFor") && js.includes('[data-component="file"][data-mode="text"][data-rtl="true"]'),
    ],
    ["Pierre font", js.includes('"Vazirmatn", var(--font-family-mono)')],
    ["global Vazirmatn", css.includes('--font-family-sans: "Vazirmatn"')],
    ["V2 Vazirmatn", css.includes('--font-family-text: "Vazirmatn"') && css.includes('--v2-font-family-sans: "Vazirmatn"')],
  ]
  const missing = checks.filter(([, present]) => !present).map(([label]) => label)
  if (missing.length > 0) throw new Error(`Patch verification failed: ${missing.join(", ")}`)
  if (variant === "rtl2") assertRtl2Isolation(unpacked)
}

function cssBlockIncludes(css, selector, text) {
  const start = css.indexOf(selector)
  if (start === -1) return false
  const open = css.indexOf("{", start)
  if (open === -1) return false
  // v1 multi-line blocks close with "\n  }"; v2 minified blocks close with "}".
  let close = css.indexOf("\n  }", open)
  if (close === -1) close = css.indexOf("}", open)
  if (close === -1) return false
  return css.slice(start, close).includes(text)
}

function assertPatchedV2(assets, mainJs, css) {
  const { allJs } = readAllChunks(assets)
  const checks = [
    ["v2 runtime", mainJs.includes("V2_RTL_RUNTIME") && mainJs.includes("applyV2Rtl(document)")],
    ["v2 prompt marker", allJs.includes("PROMPT_INPUT_RTL")],
    [
      "v2 composer 16px",
      allJs.includes("text-[16px] font-sans font-[440]") && allJs.includes("data-component=composer-editor role=textbox"),
    ],
    ["v2 composer dir", allJs.includes("data-component=composer-editor role=textbox aria-multiline=true autocomplete=off dir=auto")],
    ["v2 composer pin", css.includes("form[data-component=composer] [data-component=composer-editor]")],
    ["v2 markdown runtime", mainJs.includes("MARKDOWN_RTL") && mainJs.includes("applyMarkdownDirections")],
    ["v2 markdown bidi", css.includes("[data-component=markdown]>*{unicode-bidi:normal}") || !css.includes("[data-component=markdown]>*{unicode-bidi:plaintext}")],
    ["v2 message runtime", mainJs.includes("MESSAGE_RTL")],
    [
      "v2 user alignment",
      css.includes(
        "[data-component=user-message] [data-slot=user-message-text]{white-space:pre-wrap;word-break:break-word;background:var(--v2-background-bg-layer-02);unicode-bidi:normal;text-align:start;",
      ),
    ],
    ["v2 dock runtime", mainJs.includes("DOCK_TEXT_RTL") && mainJs.includes("applyDockTextDirections")],
    ["v2 dock observer", mainJs.includes("dockTextDirectionObserver")],
    [
      "v2 question text",
      cssBlockIncludes(css, "[data-component=dock-prompt][data-kind=question] [data-slot=question-text]", "text-align:start;"),
    ],
    [
      "v2 question option",
      cssBlockIncludes(css, "[data-component=dock-prompt][data-kind=question] [data-slot=question-option]", "text-align:start;"),
    ],
    [
      "v2 answer text",
      cssBlockIncludes(
        css,
        "[data-component=question-answers] [data-slot=question-answer-item] [data-slot=answer-text]",
        "text-align:start;",
      ),
    ],
    ["v2 textarea pin", css.includes('textarea[data-slot="question-custom-input"]{text-align:start}')],
    [
      "v2 todo content",
      cssBlockIncludes(css, "[data-component=todos] [data-slot=message-part-todo-content]", "text-align:start;"),
    ],
    ["v2 pierre runtime", mainJs.includes("observePierreDocViewers") && mainJs.includes("diffs-container")],
    ["v2 pierre font", allJs.includes('"Vazirmatn", var(--font-family-mono)')],
    ["v2 settings sans", mainJs.includes('"Vazirmatn", "Inter", ui-sans-serif')],
    ["v2 global Vazirmatn", css.includes('--font-family-sans:"Vazirmatn",')],
    ["v2 observer characterData", mainJs.includes("characterData:true")],
    ["v2 composer input trigger", mainJs.includes('closest?.("[data-component=composer-editor]")')],
    ["v2 DOMContentLoaded bootstrap", mainJs.includes("DOMContentLoaded")],
    ["v2 bootstrap warn", mainJs.includes('console.warn("[v2-rtl] bootstrap failed"')],
    ["v2 composer dir fallback", mainJs.includes("v2RtlDir") && mainJs.includes('?"rtl":"ltr"')],
    [
      "v2 text Vazirmatn",
      css.includes('--font-family-text:"Vazirmatn"') ||
        (css.includes("--font-family-text:var(--font-family-sans)") &&
          css.includes('--font-family-sans:"Vazirmatn"')),
    ],
    [
      "v2 sans Vazirmatn",
      css.includes('--v2-font-family-sans:"Vazirmatn"') ||
        ((css.includes("--v2-font-family-sans:var(--font-family-sans)") ||
          css.includes("--v2-font-family-sans:var(--font-family-text)")) &&
          (css.includes('--font-family-sans:"Vazirmatn"') ||
            css.includes('--font-family-text:"Vazirmatn"'))),
    ],
    ["v2 composer variant", mainJs.includes("prompt-input][role=textbox")],
    ["v2 dir attribute observer", mainJs.includes('attributeFilter:["dir"]')],
    ["v2 composer plaintext reset", mainJs.includes('unicodeBidi==="plaintext"')],
    ["v2 composer bidi pin", css.includes("[data-component=composer-editor],[data-component=prompt-input]{unicode-bidi:normal!important}")],
    ["v2 runtime v6 marker", mainJs.includes("V2_RTL_RUNTIME v6")],
    ["v2 dock textarea bidi pin", css.includes('textarea[data-slot="question-custom-input"]{unicode-bidi:normal!important}')],
    ["v2 dock option auto children", mainJs.includes('"[data-slot=question-option]"))e.querySelectorAll')],
    ["v2 pierre line direction", mainJs.includes('line.style.direction="rtl"')],
  ]
  const missing = checks.filter(([, present]) => !present).map(([label]) => label)
  if (missing.length > 0) throw new Error(`Patch verification failed: ${missing.join(", ")}`)
}

function findAsset(directory, pattern) {
  const matches = fs.readdirSync(directory).filter((name) => pattern.test(name))
  if (matches.length !== 1) throw new Error(`Expected exactly one ${pattern}, found ${matches.length}`)
  return matches[0]
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? "a signal"}`)
}

function runAsar(action, input, output) {
  run(NPM_EXEC, ["--yes", "@electron/asar", action, input, output])
}

function makeUnusedSibling(directory, prefix, suffix) {
  const marker = fs.mkdtempSync(path.join(directory, prefix))
  fs.rmSync(marker, { recursive: true, force: true })
  return `${marker}${suffix}`
}

async function printUpdateStatus(appPath) {
  let installed = null
  try {
    const plist = fs.readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8")
    installed = readPlistString(plist, "CFBundleShortVersionString")
  } catch {
    installed = null
  }
  const release = installed?.startsWith("1.") ? await resolveRelease(null) : await resolveReleaseV2(null)
  console.log(`Installed: ${installed ?? "none"}`)
  console.log(`Newest upstream: ${release.tag}`)
  if (!installed) {
    console.log("Status: app missing — run with --update to install, or --version X.Y.Z to pin.")
  } else if (compareVersions(installed, release.version) === 0) {
    console.log("Status: up to date.")
  } else if (compareVersions(installed, release.version) < 0) {
    console.log(`Status: update available (${installed} → ${release.version}).`)
  } else {
    console.log("Status: installed version is newer than upstream.")
  }
}

async function installOfficialApp(appPath, appName, release, workspace) {
  const zipPath = path.join(workspace, MAC_ARM64_ASSET)
  await downloadFile(release.assetUrl, zipPath)
  if (release.sha512) {
    const actual = await sha512File(zipPath)
    if (actual !== release.sha512) throw new Error(`Downloaded zip sha512 mismatch: got ${actual}`)
  }
  const extracted = path.join(workspace, "upstream")
  fs.mkdirSync(extracted, { recursive: true })
  run("ditto", ["-x", "-k", zipPath, extracted])
  const upstreamApp = findPackagedApp(extracted)
  verifyOfficialApp(upstreamApp, release.version)
  const backupPath = path.join(path.dirname(appPath), `${appName}-original-v${release.version}.app`)
  if (!fs.existsSync(backupPath)) {
    console.log(`Creating untouched backup: ${backupPath}`)
    run("ditto", [upstreamApp, backupPath])
  }
  verifyBackup(backupPath, release.version, BUNDLE_ID)
  let supersededApp
  if (fs.existsSync(appPath)) {
    supersededApp = makeUnusedSibling(path.dirname(appPath), `.${appName}-superseded-`, ".app")
    fs.renameSync(appPath, supersededApp)
  }
  run("ditto", [upstreamApp, appPath])
  return supersededApp
}

function verifyOfficialApp(appDir, version) {
  const plist = fs.readFileSync(path.join(appDir, "Contents", "Info.plist"), "utf8")
  verifyPlist(plist, version, BUNDLE_ID)
  const verified = runCapture("codesign", ["--verify", "--deep", appDir])
  if (verified.status !== 0) throw new Error(`Official app signature check failed: ${verified.stderr.trim()}`)
  const detail = runCapture("codesign", ["-dvvv", appDir])
  const text = `${detail.stdout}\n${detail.stderr}`
  if (!text.includes("Authority=")) throw new Error("Downloaded app carries no signing authority")
  if (text.includes("Signature=adhoc")) throw new Error("Downloaded app is ad-hoc signed; refusing to install")
  console.log("Official Developer-ID signature verified.")
}

function findPackagedApp(directory) {
  const top = fs.readdirSync(directory).filter((name) => name.endsWith(".app"))
  if (top.includes("OpenCode.app")) return path.join(directory, "OpenCode.app")
  if (top.length === 1) return path.join(directory, top[0])
  for (const entry of fs.readdirSync(directory)) {
    const full = path.join(directory, entry)
    if (!entry.endsWith(".app") && fs.statSync(full).isDirectory()) {
      const nested = fs.readdirSync(full).filter((name) => name.endsWith(".app"))
      if (nested.includes("OpenCode.app")) return path.join(full, "OpenCode.app")
    }
  }
  throw new Error(`Could not locate OpenCode.app in ${directory}`)
}

async function downloadFile(url, dest) {
  let res
  try {
    res = await fetch(url, { headers: { "User-Agent": "opencode-rtl-patch" } })
  } catch (error) {
    throw new Error(`Download request failed (${url}): ${error.message}`)
  }
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const total = Number(res.headers.get("content-length") ?? 0)
  let done = 0
  let lastPct = -1
  const file = fs.createWriteStream(dest)
  try {
    await pipeline(
      Readable.fromWeb(res.body),
      async function* (source) {
        for await (const chunk of source) {
          done += chunk.length
          if (total > 0) {
            const pct = Math.floor((done / total) * 100)
            if (pct >= lastPct + 10) {
              lastPct = pct
              console.log(`Downloading ${path.basename(dest)}: ${pct}%`)
            }
          }
          yield chunk
        }
      },
      file,
    )
  } catch (error) {
    try {
      fs.rmSync(dest, { force: true })
    } catch {
      // Ignore cleanup errors; the original download error matters.
    }
    throw error
  }
  const size = fs.statSync(dest).size
  if (size === 0) throw new Error(`Downloaded file is empty: ${dest}`)
  if (total > 0 && size !== total) throw new Error(`Download size mismatch: got ${size}, expected ${total}`)
  console.log(`Downloaded ${(size / 1048576).toFixed(1)} MB`)
}

async function resolveRelease(tag) {
  const clean = tag ? String(tag).trim().replace(/^v/i, "") : null
  if (clean && !/^\d+\.\d+\.\d+$/.test(clean)) throw new Error(`Unsupported version format: ${tag}`)
  const candidates = clean ? [...new Set([tag.trim(), `v${clean}`])] : [null]
  let lastError
  for (const candidate of candidates) {
    try {
      const url = candidate ? `${RELEASE_API_BASE}/tags/${candidate}` : `${RELEASE_API_BASE}/latest`
      const data = await fetchJson(url)
      const version = normalizeVersion(data.tag_name)
      const asset = (data.assets ?? []).find((entry) => entry.name === MAC_ARM64_ASSET)
      if (!asset?.browser_download_url) throw new Error(`Missing ${MAC_ARM64_ASSET} in release ${data.tag_name}`)
      return { version, assetUrl: asset.browser_download_url, tag: data.tag_name }
    } catch (error) {
      if (error.code === "NOT_FOUND") {
        lastError = error
        continue
      }
      throw error
    }
  }
  throw lastError ?? new Error(`Release not found: ${tag}`)
}

async function resolveReleaseV2(tag) {
  const clean = tag ? String(tag).trim().replace(/^v/i, "") : null
  if (clean && !/^\d+\.\d+\.\d+$/.test(clean)) throw new Error(`Unsupported version format: ${tag}`)
  let feed = null
  try {
    feed = parseV2Feed(await fetchText(`${V2_FEED_BASE}/latest-mac.yml`))
  } catch (error) {
    if (!clean) throw new Error(`Could not read the v2 update feed: ${error.message}`)
  }
  if (feed && (!clean || feed.version === clean)) {
    return { version: feed.version, tag: `v${feed.version}`, assetUrl: feed.assetUrl, sha512: feed.sha512 }
  }
  if (!clean) throw new Error("Could not parse the v2 update feed")
  return { version: clean, tag: `v${clean}`, assetUrl: `${V2_ZIP_BASE}/${clean}/${MAC_ARM64_ASSET}` }
}

function parseV2Feed(text) {
  const version = /^version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(text)?.[1]
  if (!version) throw new Error("Missing version in the v2 update feed")
  const asset = MAC_ARM64_ASSET.replace(/\./g, "\\.")
  const entry = new RegExp(`- url:\\s*(\\S*${asset})\\s+sha512:\\s*(\\S+)\\s+size:\\s*(\\d+)`)
  const match = entry.exec(text)
  if (!match) throw new Error(`Missing ${MAC_ARM64_ASSET} in the v2 update feed`)
  return { version, assetUrl: match[1], sha512: match[2], size: Number(match[3]) }
}

async function fetchText(url) {
  let res
  try {
    res = await fetch(url, { headers: { "User-Agent": "opencode-rtl-patch" } })
  } catch (error) {
    throw new Error(`Network request failed (${url}): ${error.message}`)
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText} (${url})`)
  return res.text()
}

async function sha512File(filePath) {
  const hash = crypto.createHash("sha512")
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest("base64")
}

async function fetchJson(url) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "opencode-rtl-patch" }
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(url, { headers })
  } catch (error) {
    throw new Error(`Network request failed (${url}): ${error.message}. Omit --update/--version/--check to patch offline.`)
  }
  if (res.status === 404) {
    const error = new Error(`Release not found: ${url}`)
    error.code = "NOT_FOUND"
    throw error
  }
  if (!res.ok) throw new Error(`GitHub API request failed: ${res.status} ${res.statusText}`)
  return res.json()
}

function normalizeVersion(tag) {
  const clean = String(tag).trim().replace(/^v/i, "")
  if (!/^\d+\.\d+\.\d+$/.test(clean)) throw new Error(`Unsupported version format: ${tag}`)
  return clean
}

function compareVersions(left, right) {
  const l = left.split(".").map(Number)
  const r = right.split(".").map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (l[index] !== r[index]) return l[index] < r[index] ? -1 : 1
  }
  return 0
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.error) throw result.error
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

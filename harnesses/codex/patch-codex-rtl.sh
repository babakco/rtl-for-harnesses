#!/bin/bash
set -euo pipefail
SRC="${CHATGPT_APP_SRC:-/Applications/ChatGPT.app}"
DEST="${RTL_APP_DEST:-$HOME/Applications/ChatGPT-RTL.app}"
LINK="/Applications/ChatGPT RTL.app"
MARKER="Contents/.codex-rtl-patch.json"
LEGACY_MARKER=".codex-rtl-patch.json"
RUN_PATTERN="$SRC/Contents/MacOS/ChatGPT"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGE=""
WORK=""

log() {
  printf '%s\n' "$*"
}

fail() {
  printf '%s\n' "$*" >&2
  return 1
}

cleanup() {
  if [ -n "$STAGE" ]; then
    rm -rf "$STAGE"
  fi
  if [ -n "$WORK" ]; then
    rm -rf "$WORK"
  fi
}

src_version() {
  plutil -extract CFBundleShortVersionString raw -o - "$SRC/Contents/Info.plist" 2>/dev/null
}

src_build() {
  plutil -extract CFBundleVersion raw -o - "$SRC/Contents/Info.plist" 2>/dev/null
}

asar_bytes() {
  stat -f%z "$SRC/Contents/Resources/app.asar" 2>/dev/null
}

existing_ancestor() {
  target="$1"
  while [ ! -e "$target" ] && [ "$target" != "/" ] && [ "$target" != "." ]; do
    target="$(dirname "$target")"
  done
  printf '%s' "$target"
}

guard_source() {
  if [ -d "$SRC" ] && [ -f "$SRC/Contents/Resources/app.asar" ]; then
    log "preflight source bundle exists: ok ($SRC)"
    return 0
  fi
  log "preflight source bundle exists: FAILED ($SRC missing or has no app.asar)"
  return 1
}

guard_running() {
  running="$(pgrep -f "$RUN_PATTERN" 2>/dev/null || true)"
  if [ -z "$running" ]; then
    log "preflight source app not running: ok"
    return 0
  fi
  flat="$(printf '%s' "$running" | tr '\n' ' ')"
  log "preflight source app not running: FAILED (pids: $flat)"
  return 1
}

guard_disk() {
  need="$(asar_bytes || true)"
  if [ -z "$need" ]; then
    log "preflight free space 2x asar: FAILED (cannot read asar size)"
    return 1
  fi
  parent="$(existing_ancestor "$(dirname "$DEST")")"
  have_kb="$(df -k "$parent" 2>/dev/null | awk 'NR==2 {print $4}')"
  if [ -z "$have_kb" ]; then
    log "preflight free space 2x asar: FAILED (cannot read free space for $parent)"
    return 1
  fi
  have="$((have_kb * 1024))"
  need2="$((need * 2))"
  if [ "$have" -ge "$need2" ]; then
    log "preflight free space 2x asar: ok (have $have bytes, need $need2 bytes)"
    return 0
  fi
  log "preflight free space 2x asar: FAILED (have $have bytes, need $need2 bytes)"
  return 1
}

guard_tools() {
  missing=""
  for t in node npx codesign plutil shasum find; do
    if ! command -v "$t" >/dev/null 2>&1; then
      missing="$missing $t"
    fi
  done
  if [ -z "$missing" ]; then
    log "preflight required tools present: ok (node npx codesign plutil shasum find)"
    return 0
  fi
  log "preflight required tools present: FAILED (missing:$missing)"
  return 1
}

guard_dest() {
  if [ ! -e "$DEST" ]; then
    log "preflight dest reusable: ok (absent $DEST)"
    return 0
  fi
  if [ -f "$DEST/$MARKER" ]; then
    log "preflight dest reusable: ok (previous patch marker present at $DEST/$MARKER)"
    return 0
  fi
  if [ -f "$DEST/$LEGACY_MARKER" ]; then
    log "preflight dest reusable: ok (legacy root marker present at $DEST/$LEGACY_MARKER, will rebuild sealed)"
    return 0
  fi
  log "preflight dest reusable: FAILED ($DEST exists without $MARKER, refusing to clobber)"
  return 1
}

preflight() {
  guard_source || return 1
  guard_running || return 1
  guard_disk || return 1
  guard_tools || return 1
  guard_dest || return 1
  log "preflight: all guards passed"
  return 0
}

guard_unsafe_dest() {
  local _op="${1:-make-rtl}"
  local _dest="${DEST%/}"
  local _src="${SRC%/}"
  if [ -z "$DEST" ] || [ "$DEST" = "/" ] || [ -z "$_dest" ]; then
    fail "$_op: refusing unsafe dest $DEST"
    return 1
  fi
  if [ "$_dest" = "$_src" ]; then
    fail "$_op: refusing unsafe dest $DEST (equals source $SRC)"
    return 1
  fi
  case "$_dest" in
    /|/Applications)
      fail "$_op: refusing unsafe dest $DEST"
      return 1
      ;;
  esac
  case "$_dest" in
    "$HOME"/Applications/*)
      return 0
      ;;
    /Applications/*RTL*)
      return 0
      ;;
    *)
      fail "$_op: refusing unsafe dest $DEST (not under \$HOME/Applications and not an RTL copy under /Applications)"
      return 1
      ;;
  esac
}

listing_json() {
  ASAR_LIST="$1" STAGE_DIR="$2" REPACK_MJS="$SCRIPT_DIR/tools/repack.mjs" node --input-type=module -e '
import { readFileSync, statSync } from "node:fs";
const mod = await import(process.env.REPACK_MJS);
const injected = new Set(mod.ALLOWED_DIFFERENCES.injectedHtml);
const rows = readFileSync(process.env.ASAR_LIST, "utf8").split("\n");
const root = process.env.STAGE_DIR;
const out = [];
for (const line of rows) {
  const m = line.match(/^(pack|unpack)\s*:\s*(\/.*\S)\s*$/);
  if (!m) {
    continue;
  }
  const st = statSync(root + m[2]);
  const entry = { path: m[2], size: st.size, unpacked: m[1] === "unpack", isDirectory: st.isDirectory() };
  if (injected.has(m[2])) {
    entry.content = readFileSync(root + m[2], "utf8");
  }
  out.push(entry);
}
process.stdout.write(JSON.stringify(out));
'
}

inject_file() {
  HTML_FILE="$1" INJECT_MJS="$SCRIPT_DIR/tools/inject.mjs" node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const mod = await import(process.env.INJECT_MJS);
const f = process.env.HTML_FILE;
writeFileSync(f, mod.injectHtml(readFileSync(f, "utf8"), { force: true }));
'
}

derive_globs() {
  REPACK_MJS="$SCRIPT_DIR/tools/repack.mjs" node --input-type=module -e '
import { readFileSync } from "node:fs";
const files = readFileSync(0, "utf8").split("\n").filter((l) => l.length > 0);
const mod = await import(process.env.REPACK_MJS);
process.stdout.write(mod.deriveUnpackGlobs(files).join("\n"));
'
}

verify_listings() {
  ORIG_JSON_FILE="$1" NEW_JSON_FILE="$2" REPACK_MJS="$SCRIPT_DIR/tools/repack.mjs" node --input-type=module -e '
import { readFileSync } from "node:fs";
const mod = await import(process.env.REPACK_MJS);
const res = mod.verifyRepackInvariant(readFileSync(process.env.ORIG_JSON_FILE, "utf8"), readFileSync(process.env.NEW_JSON_FILE, "utf8"));
process.stdout.write(res.reason);
if (!res.ok) {
  process.exit(1);
}
'
}

update_plist_hash() {
  PLIST_FILE="$1" NEW_HASH="$2" SIGN_MJS="$SCRIPT_DIR/tools/sign.mjs" node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const mod = await import(process.env.SIGN_MJS);
const f = process.env.PLIST_FILE;
writeFileSync(f, mod.updateAsarHash(readFileSync(f, "utf8"), process.env.NEW_HASH));
'
}

strip_entitlements_file() {
  ENT_FILE="$1" SIGN_MJS="$SCRIPT_DIR/tools/sign.mjs" node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const mod = await import(process.env.SIGN_MJS);
const f = process.env.ENT_FILE;
writeFileSync(f, mod.prepareEntitlements(readFileSync(f, "utf8")));
'
}

asar_header_hash() {
  ASAR_FILE="$1" SIGN_MJS="$SCRIPT_DIR/tools/sign.mjs" node --input-type=module -e '
const mod = await import(process.env.SIGN_MJS);
process.stdout.write(mod.asarHeaderHash(process.env.ASAR_FILE));
'
}

patch_framework_slot() {
  FW_FILE="$1" OLD_HASH="$2" NEW_HASH="$3" SIGN_MJS="$SCRIPT_DIR/tools/sign.mjs" node --input-type=module -e '
const mod = await import(process.env.SIGN_MJS);
const res = mod.patchFrameworkIntegritySlot(process.env.FW_FILE, process.env.OLD_HASH, process.env.NEW_HASH);
process.stdout.write("slot patched at " + res.offset + " " + res.oldDigestHex + " -> " + res.newDigestHex);
'
}

do_make_rtl() {
  log "make-rtl: running preflight"
  preflight || return 1
  guard_unsafe_dest "make-rtl" || return 1
  log "make-rtl: reading source version"
  if ! SRC_VERSION_START="$(src_version)"; then
    fail "make-rtl: cannot read source version, aborting"
    return 1
  fi
  if ! SRC_BUILD_START="$(src_build)"; then
    fail "make-rtl: cannot read source build, aborting"
    return 1
  fi
  log "make-rtl: hashing source asar"
  ASAR_BEFORE="$(shasum -a 256 "$SRC/Contents/Resources/app.asar" | awk '{print $1}')"
  log "make-rtl: source version $SRC_VERSION_START build $SRC_BUILD_START"
  log "make-rtl: asar sha256 before $ASAR_BEFORE"
  if [ -e "$DEST" ]; then
    log "make-rtl: removing previous dest $DEST"
    rm -rf "$DEST"
  fi
  log "make-rtl: copying $SRC to $DEST"
  cp -R "$SRC" "$DEST"
  log "make-rtl: clearing extended attributes on dest"
  xattr -cr "$DEST"
  log "make-rtl: regenerating payload css and js"
  node "$SCRIPT_DIR/tools/build-css.mjs" --fonts "$SCRIPT_DIR/fonts" --out "$SCRIPT_DIR/payload/codex-rtl.css"
  node "$SCRIPT_DIR/tools/build-payload.mjs" --detect "$SCRIPT_DIR/payload/rtl-detect.mjs" --dom "$SCRIPT_DIR/payload/rtl-dom.js" --out "$SCRIPT_DIR/payload/codex-rtl.js"
  PAYLOAD_SHA="$(shasum -a 256 "$SCRIPT_DIR/payload/codex-rtl.js" | awk '{print $1}')"
  STAGE="$(mktemp -d "${TMPDIR:-/tmp}/codex-rtl-stage.XXXXXX")"
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/codex-rtl-work.XXXXXX")"
  trap cleanup EXIT
  DEST_ASAR="$DEST/Contents/Resources/app.asar"
  ORIG_LIST="$WORK/orig.list"
  NEW_LIST="$WORK/new.list"
  ORIG_JSON_F="$WORK/orig.json"
  NEW_JSON_F="$WORK/new.json"
  ENT_RAW="$WORK/entitlements.plist"
  NEW_ASAR_TMP="$WORK/new-app.asar"
  log "make-rtl: extracting dest asar to staging"
  npx --yes @electron/asar extract "$DEST_ASAR" "$STAGE"
  log "make-rtl: recording original asar listing"
  npx --yes @electron/asar list --is-pack "$SRC/Contents/Resources/app.asar" > "$ORIG_LIST"
  if ! listing_json "$ORIG_LIST" "$STAGE" > "$ORIG_JSON_F"; then
    fail "make-rtl: could not build original listing, aborting"
    return 1
  fi
  log "make-rtl: copying payload assets into staging"
  cp "$SCRIPT_DIR/payload/codex-rtl.js" "$STAGE/webview/assets/codex-rtl.js"
  cp "$SCRIPT_DIR/payload/codex-rtl.css" "$STAGE/webview/assets/codex-rtl.css"
  log "make-rtl: injecting webview/index.html with force semantics"
  if ! inject_file "$STAGE/webview/index.html"; then
    fail "make-rtl: inject of webview/index.html failed, aborting"
    return 1
  fi
  log "make-rtl: injecting webview/detached-window.html with force semantics"
  if ! inject_file "$STAGE/webview/detached-window.html"; then
    fail "make-rtl: inject of webview/detached-window.html failed, aborting"
    return 1
  fi
  log "make-rtl: deriving unpack globs from dest app.asar.unpacked"
  if ! GLOBS="$(find "$DEST/Contents/Resources/app.asar.unpacked" -type f | derive_globs)"; then
    fail "make-rtl: deriveUnpackGlobs failed, aborting"
    return 1
  fi
  log "make-rtl: unpack globs:"
  log "$GLOBS"
  UNPACK_EXPR=""
  if [ -n "$GLOBS" ]; then
    UNPACK_EXPR="**/{$(printf '%s' "$GLOBS" | paste -sd, -)}"
  fi
  log "make-rtl: packing staging to new asar"
  if [ -n "$UNPACK_EXPR" ]; then
    npx --yes @electron/asar pack "$STAGE" "$NEW_ASAR_TMP" --unpack "$UNPACK_EXPR"
  else
    npx --yes @electron/asar pack "$STAGE" "$NEW_ASAR_TMP"
  fi
  log "make-rtl: replacing dest asar"
  mv "$NEW_ASAR_TMP" "$DEST_ASAR"
  ASAR_AFTER="$(shasum -a 256 "$DEST_ASAR" | awk '{print $1}')"
  log "make-rtl: asar sha256 after $ASAR_AFTER"
  log "make-rtl: recording new asar listing"
  npx --yes @electron/asar list --is-pack "$DEST_ASAR" > "$NEW_LIST"
  if ! listing_json "$NEW_LIST" "$STAGE" > "$NEW_JSON_F"; then
    fail "make-rtl: could not build new listing, aborting"
    return 1
  fi
  log "make-rtl: verifying repack invariant against original asar"
  if ! VERIFY_REASON="$(verify_listings "$ORIG_JSON_F" "$NEW_JSON_F")"; then
    fail "make-rtl: repack invariant failed ($VERIFY_REASON), aborting"
    return 1
  fi
  log "make-rtl: repack invariant ok ($VERIFY_REASON)"
  log "make-rtl: hashing asar header"
  if ! ASAR_HEADER_HASH="$(asar_header_hash "$DEST_ASAR")"; then
    fail "make-rtl: asar header hash failed, aborting"
    return 1
  fi
  if ! SRC_HEADER_HASH="$(asar_header_hash "$SRC/Contents/Resources/app.asar")"; then
    fail "make-rtl: source asar header hash failed, aborting"
    return 1
  fi
  log "make-rtl: asar header hash $ASAR_HEADER_HASH"
  log "make-rtl: updating asar hash in dest Info.plist"
  plutil -convert xml1 "$DEST/Contents/Info.plist"
  if ! update_plist_hash "$DEST/Contents/Info.plist" "$ASAR_HEADER_HASH"; then
    fail "make-rtl: Info.plist hash update failed, aborting"
    return 1
  fi
  log "make-rtl: patching framework asar integrity slot"
  if ! patch_framework_slot "$DEST/Contents/Frameworks/Codex Framework.framework/Codex Framework" "$SRC_HEADER_HASH" "$ASAR_HEADER_HASH"; then
    fail "make-rtl: framework integrity slot patch failed, aborting"
    return 1
  fi
  PATCHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "make-rtl: writing patch marker"
  printf '{\n  "sourceVersion": "%s",\n  "sourceBuild": "%s",\n  "asarSha256Before": "%s",\n  "asarSha256After": "%s",\n  "patchedAt": "%s",\n  "payloadSha256": "%s"\n}\n' "$SRC_VERSION_START" "$SRC_BUILD_START" "$ASAR_BEFORE" "$ASAR_AFTER" "$PATCHED_AT" "$PAYLOAD_SHA" > "$DEST/$MARKER"
  log "make-rtl: dumping dest entitlements"
  if ! codesign -d --entitlements :- "$DEST" > "$ENT_RAW" 2>"$WORK/dump.err"; then
    fail "make-rtl: codesign dump entitlements failed ($(cat "$WORK/dump.err")), aborting"
    return 1
  fi
  log "make-rtl: stripping signer-bound entitlement keys"
  if ! strip_entitlements_file "$ENT_RAW"; then
    fail "make-rtl: entitlement strip failed, aborting"
    return 1
  fi
  log "make-rtl: signing dest bundle ad-hoc"
  if ! codesign --force --deep --options runtime --sign - --entitlements "$ENT_RAW" "$DEST"; then
    fail "make-rtl: codesign sign failed, aborting"
    return 1
  fi
  log "make-rtl: verifying dest signature"
  if ! codesign --verify --deep --strict "$DEST"; then
    fail "make-rtl: codesign verify failed, aborting"
    return 1
  fi
  log "make-rtl: codesign verify ok"
  log "make-rtl: checking source version is unchanged"
  if ! SRC_VERSION_END="$(src_version)"; then
    fail "make-rtl: cannot re-read source version, aborting"
    return 1
  fi
  if [ "$SRC_VERSION_END" != "$SRC_VERSION_START" ]; then
    fail "version changed during patch, aborting"
    return 1
  fi
  log "make-rtl: creating symlink $LINK"
  if ! ln -sfn "$DEST" "$LINK"; then
    fail "make-rtl: cannot create symlink $LINK without elevation, leaving dest built at $DEST"
    return 1
  fi
  DEST_VERSION="$(plutil -extract CFBundleShortVersionString raw -o - "$DEST/Contents/Info.plist" 2>/dev/null || true)"
  DEST_ID="$(plutil -extract CFBundleIdentifier raw -o - "$DEST/Contents/Info.plist" 2>/dev/null || true)"
  log "make-rtl: done"
  log "source version $SRC_VERSION_START build $SRC_BUILD_START"
  log "dest version $DEST_VERSION identifier $DEST_ID"
  log "asar sha256 before $ASAR_BEFORE"
  log "asar sha256 after $ASAR_AFTER"
  log "codesign verify ok"
  return 0
}

do_status() {
  if [ -f "$DEST/$MARKER" ]; then
    log "status: patch installed at $DEST"
    cat "$DEST/$MARKER"
    if [ -L "$LINK" ]; then
      log "status: symlink $LINK -> $(readlink "$LINK")"
    else
    log "status: symlink $LINK absent"
    fi
    return 0
  fi
  if [ -f "$DEST/$LEGACY_MARKER" ]; then
    log "status: legacy root marker at $DEST/$LEGACY_MARKER (unsealed, rebuild with --make-rtl)"
    cat "$DEST/$LEGACY_MARKER"
    return 0
  fi
  log "status: no patch installed at $DEST"
  return 1
}

do_restore() {
  guard_unsafe_dest "restore" || return 1
  if [ ! -f "$DEST/$MARKER" ] && [ ! -f "$DEST/$LEGACY_MARKER" ]; then
    fail "restore: refusing, no patch marker at $DEST/$MARKER"
    return 1
  fi
  log "restore: removing $DEST"
  rm -rf "$DEST"
  if [ -L "$LINK" ]; then
    target="$(readlink "$LINK")"
    if [ "$target" = "$DEST" ]; then
      log "restore: removing symlink $LINK"
      rm "$LINK"
    else
      log "restore: leaving symlink $LINK (points elsewhere)"
    fi
  else
    log "restore: symlink $LINK absent"
  fi
  log "restore: done, source $SRC untouched"
  return 0
}

do_dry_run() {
  log "dry-run: no writes performed"
  if guard_source; then
    s1=0
  else
    s1=1
  fi
  if guard_running; then
    s2=0
  else
    s2=1
  fi
  if guard_disk; then
    s3=0
  else
    s3=1
  fi
  if guard_tools; then
    s4=0
  else
    s4=1
  fi
  if guard_dest; then
    s5=0
  else
    s5=1
  fi
  ver="$(src_version || true)"
  build="$(src_build || true)"
  size="$(asar_bytes || true)"
  log "--make-rtl plan (print only, nothing executed):"
  log "would run: preflight (guard results above: source=$s1 running=$s2 disk=$s3 tools=$s4 dest=$s5)"
  log "would read: source version ${ver:-unknown} build ${build:-unknown}, asar bytes ${size:-unknown}"
  log "would run: cp -R \"$SRC\" \"$DEST\""
  log "would run: xattr -cr \"$DEST\""
  log "would run: node tools/build-css.mjs --fonts fonts --out payload/codex-rtl.css"
  log "would run: node tools/build-payload.mjs --detect payload/rtl-detect.mjs --dom payload/rtl-dom.js --out payload/codex-rtl.js"
  log "would run: npx --yes @electron/asar extract \"$DEST/Contents/Resources/app.asar\" <staging>"
  log "would run: copy payload/codex-rtl.js and payload/codex-rtl.css to <staging>/webview/assets/"
  log "would run: inject <staging>/webview/index.html with force semantics via tools/inject.mjs"
  log "would run: inject <staging>/webview/detached-window.html with force semantics via tools/inject.mjs"
  log "would run: derive unpack globs via tools/repack.mjs deriveUnpackGlobs from $DEST/Contents/Resources/app.asar.unpacked"
  log "would run: npx --yes @electron/asar pack <staging> <new.asar> --unpack <derived globs>"
  log "would run: verify repack invariant via tools/repack.mjs verifyRepackInvariant against original asar"
  log "would run: hash asar header via tools/sign.mjs asarHeaderHash"
  log "would run: update ElectronAsarIntegrity hash in $DEST/Contents/Info.plist via tools/sign.mjs with header hash"
  log "would run: patch framework asar integrity slot via tools/sign.mjs patchFrameworkIntegritySlot"
  log "would write: $DEST/$MARKER with sourceVersion sourceBuild asarSha256Before asarSha256After patchedAt payloadSha256"
  log "would run: strip entitlements via tools/sign.mjs then codesign --force --deep --options runtime --sign - --entitlements <stripped> $DEST"
  log "would run: codesign --verify --deep --strict $DEST"
  log "would run: compare source CFBundleShortVersionString before and after, abort on mismatch"
  log "would run: ln -sfn \"$DEST\" \"$LINK\""
  log "would print: report with source version, dest version, asar hash before and after, sign result"
  log "dry-run: exit 0, filesystem unchanged"
  return 0
}

case "${1:-}" in
  --make-rtl)
    do_make_rtl
    ;;
  --status)
    do_status
    ;;
  --restore)
    do_restore
    ;;
  --dry-run)
    do_dry_run
    ;;
  *)
    printf 'usage: %s --make-rtl|--status|--restore|--dry-run\n' "$0" >&2
    exit 2
    ;;
esac

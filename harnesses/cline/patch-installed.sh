#!/usr/bin/env bash
# patch-installed.sh — make an identically-functional "Cline RTL" copy of the
# installed stock Cline.app with its own identity (name + bundle id) and an
# ad-hoc signature, without rebuilding anything.
#
# What it DOES:
#   1. Copies the stock app (default: /Applications/Cline.app) to OUT_DIR
#      (default: $HOME/Applications) under the RTL name.
#   2. Rewrites Info.plist identity (CFBundleName/DisplayName/Identifier) so
#      macOS, Dock and WebKit data dirs treat it as a separate app.
#   3. Clears quarantine xattrs and re-signs ad-hoc, then verifies.
#
# What it does NOT do (important):
#   The Cline frontend (Next.js) is Brotli-compressed and embedded inside the
#   `cline-app` Mach-O binary (Tauri v2 `EmbeddedAssets`, served via the
#   `tauri://` protocol — no loose .html/.js files exist in the bundle).
#   Verified on Cline 0.0.37: every `/_next/...` path is followed by a Brotli
#   blob referenced through a compiled PHF map, and chunk file hashes change
#   on every upstream release. So Vazirmatn fonts and the Persian RTL markdown
#   logic CANNOT be injected into a binary copy — they still require the
#   source patch + rebuild via build-rtl.sh. This script only gives you a
#   separately-identifiable copy (own Dock name, own settings/data dir,
#   updater still points at the stock feed — see note below).
#
# Updater note: the update feed URL is compiled into the binary
# (tauri-plugin-updater), not Info.plist, so this copy will still check the
# stock Cline release feed. Only the source-built RTL app (tauri.conf.json
# `updater.active: false`) is detached from stock updates.
#
set -euo pipefail

SRC_APP="/Applications/Cline.app"
OUT_DIR="$HOME/Applications"
APP_NAME="Cline RTL"
BUNDLE_ID="bot.cline.app.rtl"
FORCE=0

usage() {
	echo "Usage: patch-installed.sh [--src APP] [--out DIR] [--name NAME] [--id ID] [--force]"
	echo "  --src APP  stock app to copy (default: /Applications/Cline.app)"
	echo "  --out DIR  where to place '<NAME>.app' (default: \$HOME/Applications)"
	echo "  --name NAME  copy name (default: Cline RTL)"
	echo "  --id ID    bundle identifier (default: bot.cline.app.rtl)"
	echo "  --force    overwrite an existing copy"
}

while [ $# -gt 0 ]; do
	case "$1" in
		--src) SRC_APP="$2"; shift 2 ;;
		--out) OUT_DIR="$2"; shift 2 ;;
		--name) APP_NAME="$2"; shift 2 ;;
		--id) BUNDLE_ID="$2"; shift 2 ;;
		--force) FORCE=1; shift ;;
		-h|--help) usage; exit 0 ;;
		*) echo "Unknown flag: $1"; usage; exit 1 ;;
	esac
done

PLISTBUDDY="/usr/libexec/PlistBuddy"

if [ ! -d "$SRC_APP" ]; then
	echo "Source app not found: $SRC_APP"
	exit 1
fi
if [ ! -f "$SRC_APP/Contents/Info.plist" ]; then
	echo "Not an app bundle (no Info.plist): $SRC_APP"
	exit 1
fi

SRC_VERSION="$("$PLISTBUDDY" -c "Print :CFBundleShortVersionString" "$SRC_APP/Contents/Info.plist" 2>/dev/null || echo unknown)"
SRC_ID="$("$PLISTBUDDY" -c "Print :CFBundleIdentifier" "$SRC_APP/Contents/Info.plist" 2>/dev/null || echo unknown)"
echo "Source: $SRC_APP (version $SRC_VERSION, id $SRC_ID)"

DEST_APP="$OUT_DIR/$APP_NAME.app"
if [ -e "$DEST_APP" ] && [ "$FORCE" -eq 0 ]; then
	echo "Destination already exists: $DEST_APP"
	echo "Re-run with --force to overwrite it."
	exit 1
fi

mkdir -p "$OUT_DIR"
if [ -e "$DEST_APP" ]; then
	rm -rf "$DEST_APP"
fi
echo "Copying to $DEST_APP ..."
cp -R "$SRC_APP" "$DEST_APP"

echo "Rewriting bundle identity ..."
"$PLISTBUDDY" -c "Set :CFBundleName $APP_NAME" "$DEST_APP/Contents/Info.plist"
"$PLISTBUDDY" -c "Set :CFBundleDisplayName $APP_NAME" "$DEST_APP/Contents/Info.plist"
"$PLISTBUDDY" -c "Set :CFBundleIdentifier $BUNDLE_ID" "$DEST_APP/Contents/Info.plist"

# Drop quarantine (downloaded/updated apps) so the first launch does not get
# blocked by Gatekeeper beyond the usual ad-hoc signature warning.
xattr -cr "$DEST_APP" 2>/dev/null || true

echo "Re-signing ad-hoc ..."
codesign --force --deep --sign - "$DEST_APP"
codesign --verify --deep --strict --verbose=2 "$DEST_APP" 2>&1 | tail -n 2

echo "Done: $DEST_APP"
echo "NOTE: this copy has its own name/identity but the STOCK UI — Persian"
echo "RTL fonts and markdown fixes still need: ./build-rtl.sh --from-installed"

#!/usr/bin/env bash
set -euo pipefail

# Fallback ref when neither --tag nor --from-installed is given.
UPSTREAM_COMMIT="476b165b97aaafb47ee8a82b093f25d5611395d9"
CLONE_URL="https://github.com/cline/cline.git"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$PATCH_DIR/cline-rtl.patch"

SRC_DIR=""
OUT_DIR="$HOME/Applications"
PATCH_ONLY=0
FROM_INSTALLED=0
INSTALLED_APP="/Applications/Cline.app"
TAG=""
WORKDIR="${XDG_CACHE_HOME:-$HOME/.cache}/cline-rtl"
FRESH=0

usage() {
	echo "Usage: build-rtl.sh [--src DIR] [--out DIR] [--patch-only]"
	echo "                     [--from-installed [--installed-app APP]] [--tag TAG]"
	echo "                     [--workdir DIR] [--fresh]"
	echo "  --src DIR    use an existing cline checkout instead of the persistent cache"
	echo "  --out DIR    where to place 'Cline RTL.app' (default: \$HOME/Applications)"
	echo "  --patch-only apply the patch and stop before install/build"
	echo "  --from-installed  read the stock app version and build that tag"
	echo "                    (default stock app: /Applications/Cline.app)"
	echo "  --installed-app APP  stock app to read the version from (implies --from-installed)"
	echo "  --tag TAG    build this upstream tag (e.g. desktop-v0.0.37) instead of"
	echo "               the fallback commit"
	echo "  --workdir DIR  persistent checkout cache (default: ~/.cache/cline-rtl;"
	echo "               reused across runs so rebuilds stay incremental)"
	echo "  --fresh      wipe the persistent checkout and start clean"
	echo ""
	echo "Examples:"
	echo "  ./build-rtl.sh --from-installed --out ~/Applications   # track stock 0.0.37+"
	echo "  ./build-rtl.sh --tag desktop-v0.0.37 --patch-only       # inspect only"
}

while [ $# -gt 0 ]; do
	case "$1" in
		--src) SRC_DIR="$2"; shift 2 ;;
		--out) OUT_DIR="$2"; shift 2 ;;
		--patch-only) PATCH_ONLY=1; shift ;;
		--from-installed) FROM_INSTALLED=1; shift ;;
		--installed-app) INSTALLED_APP="$2"; FROM_INSTALLED=1; shift 2 ;;
		--tag) TAG="$2"; shift 2 ;;
		--workdir) WORKDIR="$2"; shift 2 ;;
		--fresh) FRESH=1; shift ;;
		-h|--help) usage; exit 0 ;;
		*) echo "Unknown flag: $1"; usage; exit 1 ;;
	esac
done

if [ ! -f "$PATCH_FILE" ]; then
	echo "Patch not found: $PATCH_FILE"
	exit 1
fi

for cmd in git bun rustc xcodebuild curl; do
	command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required tool: $cmd"; exit 1; }
done

# Resolve which upstream ref to build.
REF="$UPSTREAM_COMMIT"
if [ "$FROM_INSTALLED" -eq 1 ]; then
	if [ ! -d "$INSTALLED_APP" ]; then
		echo "Installed app not found: $INSTALLED_APP"
		exit 1
	fi
	VER="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INSTALLED_APP/Contents/Info.plist" 2>/dev/null || true)"
	if [ -z "$VER" ]; then
		echo "Could not read version from $INSTALLED_APP"
		exit 1
	fi
	TAG="desktop-v$VER"
	echo "Stock app version $VER -> tag $TAG"
fi
if [ -n "$TAG" ]; then
	REF="$TAG"
fi
echo "Upstream ref: $REF"

# Fetch a branch, tag or commit SHA into a shallow checkout.
# Plain `git fetch origin <tag>` does not find tags outside the default
# refspec, so tags are fetched with the explicit `tag` refspec first.
fetch_ref() {
	git fetch --depth 1 origin tag "$REF" 2>/dev/null \
		|| git fetch origin "$REF" --depth 1 2>/dev/null \
		|| true
}

if [ -n "$SRC_DIR" ]; then
	if [ ! -d "$SRC_DIR/.git" ]; then
		echo "Not a git checkout: $SRC_DIR"
		exit 1
	fi
	cd "$SRC_DIR"
	if [ -n "$(git status --porcelain)" ]; then
		echo "Checkout is dirty: $SRC_DIR"
		echo "Commit, stash or clean it before applying the RTL patch."
		exit 1
	fi
	fetch_ref
	git checkout "$REF"
else
	CACHE_SRC="$WORKDIR/cline"
	if [ "$FRESH" -eq 1 ]; then
		rm -rf "$CACHE_SRC"
	fi
	if [ ! -d "$CACHE_SRC/.git" ]; then
		mkdir -p "$WORKDIR"
		git clone --depth 1 "$CLONE_URL" "$CACHE_SRC"
	fi
	cd "$CACHE_SRC"
	SRC_DIR="$CACHE_SRC"
	fetch_ref
	# Drop any previously applied RTL patch *before* switching refs; otherwise
	# the leftover modifications block `git checkout` when the tag changes
	# (the files touched by the patch differ between releases).
	# Ignored build caches (node_modules, Rust target/) survive, so rebuilds
	# stay incremental.
	git reset --hard HEAD
	git clean -fd
	git checkout "$REF"
	git reset --hard "$REF"
	git clean -fd
fi

# The patch carries tauri.conf.json's "version" line as diff context, but
# upstream bumps it every release. Sync that one context line to whatever the
# checkout has, so the patch stays version-independent.
TAURI_CONF="$SRC_DIR/apps/examples/desktop-app/src-tauri/tauri.conf.json"
CHECKOUT_VER="$(grep '"version"' "$TAURI_CONF" | head -1 | grep -o '[0-9][0-9.]*' | head -1)"
PATCH_TMP="$(mktemp /tmp/cline-rtl-patch.XXXXXX)"
TAB="$(printf '\t')"
sed "s/^ ${TAB}\"version\": \"[^\"]*\",$/ ${TAB}\"version\": \"${CHECKOUT_VER}\",/" "$PATCH_FILE" > "$PATCH_TMP"
PATCH_FILE="$PATCH_TMP"

if git apply --check "$PATCH_FILE"; then
	git apply "$PATCH_FILE"
elif git apply --3way --check "$PATCH_FILE" 2>/dev/null; then
	echo "Clean apply failed; retrying as 3-way merge ..."
	git apply --3way "$PATCH_FILE"
else
	echo "Patch does not apply to $REF."
	echo "Upstream files changed; the RTL patch needs a manual rebase."
	git apply --check "$PATCH_FILE" || true
	exit 1
fi
echo "Patch applied."

# Vazirmatn woff2 subsets (see rtl.css). Fetched instead of declared as an npm
# dependency on purpose: adding a dependency invalidates the upstream bun.lock,
# so bun re-resolves unrelated packages (e.g. @ai-sdk/*) and `bun run build:sdk`
# then fails to typecheck. Downloads are checksum-verified.
fetch_fonts() {
	local dest="$SRC_DIR/apps/examples/desktop-app/webview/public/fonts"
	local base="https://cdn.jsdelivr.net/npm/@fontsource-variable/vazirmatn@5.3.0/files"
	mkdir -p "$dest"
	local fonts=(
		"vazirmatn-arabic-wght-normal.woff2 84a382e46c30fb4f73d0e3800c16d0af15888e2731e57fa5f93e2c29a2c6a957"
		"vazirmatn-latin-ext-wght-normal.woff2 21529facfd236f6be527e4353623bdb889c96a7ebb7db1e148e28406be0ea004"
		"vazirmatn-latin-wght-normal.woff2 d29c041cd4294af893cf3c01dfab6d47202c667ab55d702f68782599918c651d"
	)
	local entry name sum
	for entry in "${fonts[@]}"; do
		name="${entry%% *}"
		sum="${entry##* }"
		curl -sSfL --retry 3 -o "$dest/$name" "$base/$name"
		echo "$sum  $dest/$name" | shasum -a 256 -c - >/dev/null
	done
	echo "Fonts ready in $dest"
}

if [ "$PATCH_ONLY" -eq 1 ]; then
	echo "Patch-only mode: source is ready at $SRC_DIR"
	exit 0
fi

fetch_fonts
bun install
# SDK workspace dists (e.g. @cline/shared/dist) must exist before the
# desktop webview typechecks and bundles.
bun run build:sdk

BUILT_APP="apps/examples/desktop-app/src-tauri/target/release/bundle/macos/Cline RTL.app"
BUILT_APP_ABS="$SRC_DIR/$BUILT_APP"

# Local-only ad-hoc signed macOS package (no Developer ID/notarization).
# `tauri build` also bundles a .dmg, and bundle_dmg.sh intermittently fails in
# headless sessions; that does not affect the .app, so fall back to signing the
# app bundle ourselves instead of losing the whole build.
if ! (cd apps/examples/desktop-app && ALLOW_UNSIGNED_MAC=1 bun run package:desktop:mac); then
	echo "package:desktop:mac failed; falling back to the raw .app bundle."
	if [ ! -d "$BUILT_APP_ABS" ]; then
		echo "Build failed and no app bundle at $BUILT_APP"
		exit 1
	fi
	codesign --force --deep --sign - "$BUILT_APP_ABS"
fi

if [ ! -d "$BUILT_APP_ABS" ]; then
	echo "Build finished but expected bundle not found: $BUILT_APP"
	exit 1
fi
codesign --verify --deep --strict --verbose=2 "$BUILT_APP_ABS" 2>&1 | tail -n 2

mkdir -p "$OUT_DIR"
rm -rf "$OUT_DIR/Cline RTL.app"
cp -R "$BUILT_APP_ABS" "$OUT_DIR/Cline RTL.app"
echo "Cline RTL.app installed to $OUT_DIR/Cline RTL.app"

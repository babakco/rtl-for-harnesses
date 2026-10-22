#!/usr/bin/env bash
#
# build-zed-rtl.sh — ساخت نسخه RTL فارسی Zed از روی سورس
#
# Usage:
#   ./scripts/build-zed-rtl.sh [TAG] [--workdir DIR] [--skip-build] [--no-install]
#
#   TAG          تگ نسخه Zed، مثلاً v1.18.1 (پیش‌فرض: v1.18.1)
#   --workdir    مسیر checkout سورس (پیش‌فرض: ~/src/zed-rtl-build)
#   --skip-build رد شدن از کامپایل (فقط اعمال پچ + باندل موجود را ری‌برند کن)
#   --no-install فقط بساز، در /Applications نصب نکن
#
# برای نسخه جدید Zed کافی است:
#   ۱) پچ‌های patches/<TAG-جدید>/ را آماده کنی (راهنما: README بخش «نسخه جدید»)
#   ۲) ./scripts/build-zed-rtl.sh <TAG-جدید>
#
# خروجی: /Applications/Zed-RTL.app  (Bundle ID: dev.zed.Zed-RTL)

set -euo pipefail

TAG="${1:-v1.18.1}"
shift || true

WORKDIR="${HOME}/src/zed-rtl-build"
SKIP_BUILD=false
DO_INSTALL=true
APP_NAME="Zed-RTL"
BUNDLE_ID="dev.zed.Zed-RTL"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --workdir) WORKDIR="$2"; shift 2 ;;
        --skip-build) SKIP_BUILD=true; shift ;;
        --no-install) DO_INSTALL=false; shift ;;
        -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PATCH_DIR="${REPO_ROOT}/patches/${TAG}"

if [[ "$(uname)" != "Darwin" ]]; then
    echo "ERROR: macOS bundle build requires macOS (Darwin)." >&2
    exit 1
fi

if [[ ! -d "${PATCH_DIR}" ]]; then
    echo "ERROR: no patches for ${TAG} (missing ${PATCH_DIR})." >&2
    echo "Available versions:" >&2
    ls "${REPO_ROOT}/patches/" >&2
    echo "See README section «نسخه جدید Zed» for the upgrade recipe." >&2
    exit 1
fi

command -v rustup >/dev/null || { echo "ERROR: rustup not found (https://rustup.rs)" >&2; exit 1; }
command -v git >/dev/null || { echo "ERROR: git not found" >&2; exit 1; }
xcode-select -p >/dev/null 2>&1 || { echo "ERROR: Xcode CLT missing (xcode-select --install)" >&2; exit 1; }

# rustup shims must win over stray cargos (e.g. MacPorts /opt/local/bin/cargo),
# otherwise rust-toolchain.toml is ignored and the build fails on MSRV.
if [[ -d "${HOME}/.cargo/bin" ]]; then
    export PATH="${HOME}/.cargo/bin:${PATH}"
fi
echo "==> cargo: $(command -v cargo) ($(cargo --version))"

# ── ۱) سورس ──────────────────────────────────────────────────────────
if [[ ! -d "${WORKDIR}/.git" ]]; then
    echo "==> Cloning zed @ ${TAG} into ${WORKDIR}"
    mkdir -p "$(dirname "${WORKDIR}")"
    git clone --branch "${TAG}" --depth 1 https://github.com/zed-industries/zed.git "${WORKDIR}"
else
    echo "==> Fetching ${TAG} in existing ${WORKDIR}"
    git -C "${WORKDIR}" fetch --depth 1 origin "tag ${TAG}"
    git -C "${WORKDIR}" checkout -f "${TAG}"
fi

# ── ۲) اعمال پچ‌ها ──────────────────────────────────────────────────
echo "==> Applying ZED-RTL patches from ${PATCH_DIR}"
git -C "${WORKDIR}" status --porcelain | grep -q . && {
    echo "ERROR: workdir has local changes; stash or clean ${WORKDIR} first." >&2
    exit 1
}
for patch in "${PATCH_DIR}"/*.patch; do
    echo "--- applying $(basename "${patch}")"
    git -C "${WORKDIR}" apply --check -v "${patch}"
    git -C "${WORKDIR}" apply -v "${patch}"
done

# ── ۳) بیلد + باندل macOS ───────────────────────────────────────────
if [[ "${SKIP_BUILD}" == true ]]; then
    echo "==> --skip-build: reusing existing bundle under ${WORKDIR}/target"
else
    echo "==> Building (this takes a long time on first run)…"
    pushd "${WORKDIR}" >/dev/null
    ./script/bundle-mac
    popd >/dev/null
fi

BUILT_APP="$(find "${WORKDIR}/target" -maxdepth 4 -name "Zed.app" -type d | head -1 || true)"
if [[ -z "${BUILT_APP}" ]]; then
    echo "ERROR: built Zed.app not found under ${WORKDIR}/target" >&2
    exit 1
fi
echo "==> Built bundle: ${BUILT_APP}"

# ── ۴) ری‌برند به Zed-RTL ───────────────────────────────────────────
STAGE="$(mktemp -d)/${APP_NAME}.app"
echo "==> Rebranding to ${APP_NAME} (stage: ${STAGE})"
rm -rf "${STAGE}"
cp -R "${BUILT_APP}" "${STAGE}"
chmod -R u+w "${STAGE}"

/usr/libexec/PlistBuddy -c "Set :CFBundleName ${APP_NAME}" "${STAGE}/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${APP_NAME}" "${STAGE}/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${BUNDLE_ID}" "${STAGE}/Contents/Info.plist"
# URL scheme جدا تا با Zed اصلی تداخل نکند (zed-rtl://)
if /usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes:0" "${STAGE}/Contents/Info.plist" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 zed-rtl" "${STAGE}/Contents/Info.plist"
fi

echo "==> Ad-hoc code signing…"
codesign --force --deep --sign - "${STAGE}"

# ── ۵) نصب ──────────────────────────────────────────────────────────
if [[ "${DO_INSTALL}" == true ]]; then
    DEST="/Applications/${APP_NAME}.app"
    if [[ -d "${DEST}" ]]; then
        BACKUP="${DEST}.backup-$(date +%Y%m%d-%H%M%S)"
        echo "==> Backing up existing install to ${BACKUP}"
        mv "${DEST}" "${BACKUP}"
    fi
    echo "==> Installing to ${DEST} (needs admin — use sudo if it fails)"
    cp -R "${STAGE}" "${DEST}" || sudo cp -R "${STAGE}" "${DEST}"
    echo "==> Installed. First launch: right-click > Open (ad-hoc signature)."
else
    echo "==> --no-install: staged app left at ${STAGE}"
fi

# ── ۶) فونت ─────────────────────────────────────────────────────────
"${SCRIPT_DIR}/apply-settings.sh" || echo "WARNING: font settings step failed — run scripts/apply-settings.sh manually."

echo "==> DONE: /Applications/${APP_NAME}.app  (from Zed ${TAG} + ZED-RTL patches)"

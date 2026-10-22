#!/usr/bin/env bash
#
# apply-patches.sh — اعمال پچ ZED-RTL روی سورس Zed، بدون بیلد کامل
#
# Usage:
#   ./scripts/apply-patches.sh [TAG] [--workdir DIR] [--check]
#
#   TAG        تگ نسخه Zed، مثلاً v1.18.1 (پیش‌فرض: v1.18.1)
#   --workdir  مسیر checkout سورس (پیش‌فرض: ~/src/zed-rtl)
#   --check    بعد از اعمال پچ، صحت تایپ‌ها را با cargo check بررسی کن
#              (فقط کرت‌های markdown و agent_ui؛ بدون بیلد release)
#
# این اسکریپت سورس را تغییر می‌دهد؛ خروجی‌اش سورس پچ‌شده آماده بیلد است.
# برای بیلد کامل .app از scripts/build-zed-rtl.sh استفاده کن.

set -euo pipefail

TAG="${1:-v1.18.1}"
shift || true

WORKDIR="${HOME}/src/zed-rtl"
DO_CHECK=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --workdir) WORKDIR="$2"; shift 2 ;;
        --check) DO_CHECK=true; shift ;;
        -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PATCH_DIR="${REPO_ROOT}/patches/${TAG}"

if [[ ! -d "${PATCH_DIR}" ]]; then
    echo "ERROR: no patches for ${TAG} (missing ${PATCH_DIR})." >&2
    echo "Available versions:" >&2
    ls "${REPO_ROOT}/patches/" >&2
    exit 1
fi

# rustup shims must win over stray cargos (e.g. MacPorts /opt/local/bin/cargo),
# otherwise rust-toolchain.toml is ignored and cargo check fails on MSRV.
if [[ -d "${HOME}/.cargo/bin" ]]; then
    export PATH="${HOME}/.cargo/bin:${PATH}"
fi

if [[ ! -d "${WORKDIR}/.git" ]]; then
    echo "==> Cloning zed @ ${TAG} into ${WORKDIR}"
    mkdir -p "$(dirname "${WORKDIR}")"
    git clone --branch "${TAG}" --depth 1 https://github.com/zed-industries/zed.git "${WORKDIR}"
else
    echo "==> Fetching ${TAG} in existing ${WORKDIR}"
    git -C "${WORKDIR}" fetch --depth 1 origin "tag ${TAG}"
    git -C "${WORKDIR}" checkout -f "${TAG}"
    git -C "${WORKDIR}" clean -fd
fi

echo "==> Applying ZED-RTL patches from ${PATCH_DIR}"
for patch in "${PATCH_DIR}"/*.patch; do
    echo "--- $(basename "${patch}")"
    git -C "${WORKDIR}" apply --check -v "${patch}"
    git -C "${WORKDIR}" apply -v "${patch}"
done

if [[ "${DO_CHECK}" == true ]]; then
    echo "==> Type-checking patched crates (no release build)…"
    (cd "${WORKDIR}" && cargo --version && cargo check -p markdown -p agent_ui 2>&1 | tail -3)
fi

echo "==> DONE. Patched source at ${WORKDIR}"
git -C "${WORKDIR}" status --short

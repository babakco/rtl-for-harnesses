#!/bin/bash
# ============================================================================
# Claude Desktop RTL Live Patcher for macOS
#
# Patches /Applications/Claude.app IN PLACE with MINIMAL changes — only the
# RTL renderer payload (+ optional font). Unlike the isolated-profile patch
# (patch.sh), this one:
#   * keeps the app's own profile (~/Library/Application Support/Claude),
#   * keeps CC Switch provider switching working (deploymentMode 3p, env),
#   * keeps the Claude Code tab working (fresh OAuth session stays valid),
#   * needs NO sudo when /Applications/Claude.app is user-owned.
#
# A backup of the untouched app is created at
#   ~/Applications/Claude.app.pre-rtl-backup
# (restore with: ./patch-live.sh --restore).
#
# After every Anthropic auto-update, re-run: ./patch-live.sh --install
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD_FILE="$SCRIPT_DIR/rtl-payload.js"
FONTS_DIR="$SCRIPT_DIR/fonts"

APP="/Applications/Claude.app"
BACKUP="$HOME/Applications/Claude.app.pre-rtl-backup"
ASAR="$APP/Contents/Resources/app.asar"

RTL_FONT_FAMILY="${RTL_FONT_FAMILY-}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()     { echo -e "  ${CYAN}[*]${NC} $1"; }
success() { echo -e "  ${GREEN}[+]${NC} $1"; }
warn()    { echo -e "  ${YELLOW}[!]${NC} $1"; }
err()     { echo -e "  ${RED}[X]${NC} $1"; }
step()    { echo -e "\n${BOLD}${CYAN}► $1${NC}"; }
die()     { err "$1"; exit 1; }

TMP_DIR=""
cleanup() { [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR" 2>/dev/null || true; }
trap cleanup EXIT

asar_cmd() {
    if command -v asar &>/dev/null; then asar "$@";
    elif command -v npx &>/dev/null; then npx --yes @electron/asar "$@";
    else die "Bug: asar_cmd called without asar/npx."; fi
}
fuses_cmd() {
    command -v npx &>/dev/null || die "npx not found (install Node.js)."
    npx --yes @electron/fuses "$@"
}

build_font_injector() {
    # Append a self-contained @font-face + [dir=rtl] rule IIFE to $1 (header file).
    local header="$1"
    local family="${RTL_FONT_FAMILY//\"/}"; family="${family//\\/}"; family="${family//\'/}"
    [ -z "$family" ] && return 0
    local face_css="" embedded=0
    if [ -d "$FONTS_DIR" ]; then
        shopt -s nullglob nocaseglob
        local f
        for f in "$FONTS_DIR"/*.woff2 "$FONTS_DIR"/*.woff "$FONTS_DIR"/*.ttf "$FONTS_DIR"/*.otf; do
            [ -f "$f" ] || continue
            local lc weight style ext fmt mime b64
            lc=$(basename "$f" | tr '[:upper:]' '[:lower:]')
            weight=400
            case "$lc" in
                *thin*) weight=100 ;; *extralight*|*ultralight*) weight=200 ;; *light*) weight=300 ;;
                *medium*) weight=500 ;; *semibold*|*demibold*) weight=600 ;; *extrabold*|*ultrabold*) weight=800 ;;
                *black*|*heavy*) weight=900 ;; *bold*) weight=700 ;;
            esac
            style=normal; case "$lc" in *italic*|*oblique*) style=italic ;; esac
            ext="${lc##*.}"
            case "$ext" in
                woff2) fmt=woff2; mime="font/woff2" ;; woff) fmt=woff; mime="font/woff" ;;
                ttf) fmt=truetype; mime="font/ttf" ;; otf) fmt=opentype; mime="font/otf" ;; *) continue ;;
            esac
            b64=$(base64 < "$f" | tr -d '\n')
            face_css+="@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(data:${mime};base64,${b64}) format('${fmt}');}"
            embedded=$((embedded + 1))
        done
        shopt -u nullglob nocaseglob
    fi
    # Apply the family SCOPED to text-bearing elements only. A blanket
    # `html,body,body *` font rule breaks Claude's buttons (their text and SVG
    # icons render invisible but stay clickable) because it overrides the app's
    # own control fonts everywhere. So we:
    #   * set the --font-sans / --font-voice CSS variables (no !important, so
    #     app rules using them keep working),
    #   * force the family on text elements (p/li/h1-6/blockquote/td/th/... and
    #     span/div),
    #   * EXPLICITLY EXCLUDE buttons/inputs/icons/svg/code from the family so
    #     controls keep their app font and visible glyphs.
    # Code blocks always stay monospace (rule must come last; same specificity,
    # later wins).
    face_css+=":root{--font-sans:'${family}','Anthropic Sans Variable','Anthropic Sans',system-ui,sans-serif;--font-voice:'${family}','Anthropic Sans Variable','Anthropic Sans',sans-serif}"
    face_css+="p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,summary,label,legend,dt,dd,figcaption,caption,span,div{font-family:'${family}','Anthropic Sans Variable','Anthropic Sans',system-ui,sans-serif}"
    face_css+="button,a,input,textarea,select,svg,code,pre,kbd,samp,[role='button'],[class*='icon'],[data-testid*='button'],[data-testid*='icon']{font-family:'Anthropic Sans Variable','Anthropic Sans',system-ui,sans-serif!important}"
    face_css+="pre,code,kbd,samp,[class*='language-'],[class*='token'],[data-code-block],[data-testid*='code']{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important}"
    {
        printf '\n// --- CLAUDE RTL FONT START ---\n'
        printf ';(function(){if(typeof document==="undefined")return;function add(){if(document.getElementById("claude-rtl-font"))return;if(!document.head&&!document.documentElement)return;var s=document.createElement("style");s.id="claude-rtl-font";s.textContent="%s";(document.head||document.documentElement).appendChild(s);}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",add);}else{add();}})();\n' "$face_css"
        printf '// --- CLAUDE RTL FONT END ---\n'
    } >> "$header"
    if [ "$embedded" -gt 0 ]; then
        success "RTL font: \"$family\" — embedded $embedded file(s) from fonts/ as base64 data: URIs."
    else
        warn "RTL font: \"$family\" — no files in fonts/, relying on an installed font of that name."
    fi
}

quit_claude() {
    if pgrep -x "Claude" &>/dev/null || pgrep -f "/Applications/Claude.app/Contents/MacOS/Claude$" &>/dev/null; then
        step "Quitting Claude.app..."
        osascript -e 'tell application "Claude" to quit' 2>/dev/null || true
        sleep 2
        pkill -f "/Applications/Claude.app/Contents/MacOS/Claude" 2>/dev/null || true
        sleep 1
    fi

    if pgrep -f "$RTL_APP_DEST/Contents/MacOS/Claude$" &>/dev/null; then
        step "Quitting Claude-RTL.app..."
        pkill -f "$RTL_APP_DEST/Contents/MacOS/Claude" 2>/dev/null || true
        sleep 2
        pgrep -f "$RTL_APP_DEST/Contents/MacOS/Claude$" &>/dev/null && die "Claude-RTL.app is still running; refusing to replace it."
    fi
}

is_already_patched() {
    # A live patch is detected by the ASAR-integrity fuse being off.
    npx --yes @electron/fuses read --app "$APP" 2>/dev/null | grep -q "EnableEmbeddedAsarIntegrityValidation.*Disabled"
}

make_rtl_app() {
    echo -e "\n${BOLD}${CYAN}=========================================================${NC}"
    echo -e "${BOLD}${CYAN}   Claude Desktop RTL — Build RTL copy (original stays clean)${NC}"
    echo -e "${BOLD}${CYAN}=========================================================${NC}\n"

    [ -d "$APP" ] || die "Claude.app not found at $APP."
    command -v npx >/dev/null 2>&1 || die "Node.js/npx not found."
    command -v codesign >/dev/null 2>&1 || die "Xcode CLT (codesign) not found."
    quit_claude

    local src_ver dest_ver
    src_ver=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null || echo "unknown")
    log "Source original: $APP (version $src_ver)"

    # Remove a stale RTL copy, then copy the CURRENT (original) app fresh.
    rm -rf "$RTL_APP_DEST"
    step "Copying original Claude.app -> $RTL_APP_DEST ..."
    cp -R "$APP" "$RTL_APP_DEST"
    success "Copied."

    dest_ver=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$RTL_APP_DEST/Contents/Info.plist" 2>/dev/null || echo "unknown")
    log "RTL copy: $RTL_APP_DEST (version $dest_ver)"

    # Patch the COPY in place (this also strips old headers via --force since
    # the copy may carry a previous patch header, then re-injects the current
    # scoped font rules).
    local saved_app saved_asar saved_backup
    saved_app="$APP"; saved_asar="$ASAR"; saved_backup="$BACKUP"
    APP="$RTL_APP_DEST"; ASAR="$RTL_APP_DEST/Contents/Resources/app.asar"; BACKUP=""
    FORCE=1
    install_live
    APP="$saved_app"; ASAR="$saved_asar"; BACKUP="$saved_backup"

    echo -e "\n${BOLD}${GREEN}   RTL COPY READY — the original app was NOT modified.${NC}"
    echo ""
    echo "  RTL app:   $RTL_APP_DEST"
    echo "  Original:  $APP  (still Anthropic-signed, auto-updates keep working)"
    echo ""
    echo "  Workflow after each Claude update:"
    echo "    ./patch-live.sh --make-rtl --font Vazirmatn"
    echo ""
}

install_live() {
    echo -e "\n${BOLD}${CYAN}=========================================================${NC}"
    echo -e "${BOLD}${CYAN}   Claude Desktop RTL Live Patcher — Install (in place)${NC}"
    echo -e "${BOLD}${CYAN}=========================================================${NC}\n"

    [ -d "$APP" ] || die "Claude.app not found at $APP."
    [ -f "$PAYLOAD_FILE" ] || die "rtl-payload.js missing. Re-clone the repo."
    [ -w "$APP/Contents/Resources" ] || die "$APP is not writable. Run with sudo? The app must be user-owned."

    command -v npx >/dev/null 2>&1 || die "Node.js/npx not found."
    command -v codesign >/dev/null 2>&1 || die "Xcode CLT (codesign) not found."

    quit_claude
    TMP_DIR=$(mktemp -d)

    # --- Backup the untouched original (keeps the Anthropic signature) ---
    if [ -z "$BACKUP" ]; then
        log "Backup skipped (RTL copy mode)."
    elif [ -d "$BACKUP" ]; then
        log "Backup already exists at $BACKUP — keeping it."
    else
        step "Creating backup of the untouched app..."
        mkdir -p "$(dirname "$BACKUP")"
        cp -R "$APP" "$BACKUP"
        success "Backup: $BACKUP"
    fi

    if is_already_patched; then
        if [ "$FORCE" = "1" ]; then
            log "App carries an older patch — --force will strip it and re-inject the current payload."
        else
            warn "App already carries the RTL patch. Files already marked as patched will be SKIPPED."
            warn "If you changed the script's payload (e.g. new font rules), re-run with --force to re-inject:"
            warn "    ./patch-live.sh --install --font Vazirmatn --force"
        fi
    fi

    # --- Extract entitlements BEFORE any modification ---
    ENT="$TMP_DIR/entitlements.plist"
    mkdir -p "$TMP_DIR"
    if codesign -d --entitlements :- "$APP" > "$ENT" 2>/dev/null && [ -s "$ENT" ]; then
        /usr/libexec/PlistBuddy -c "Delete :com.apple.application-identifier" "$ENT" 2>/dev/null || true
        /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.team-identifier" "$ENT" 2>/dev/null || true
        /usr/libexec/PlistBuddy -c "Delete :keychain-access-groups" "$ENT" 2>/dev/null || true
        log "Entitlements preserved (team-id keys stripped)."
    else
        warn "Could not read entitlements; continuing without them."
        ENT=""
    fi

    # --- Extract ASAR ---
    step "Extracting app.asar..."
    asar_cmd extract "$ASAR" "$TMP_DIR/app"
    success "Extracted."

    # --- Build header (RTL payload + optional font) ---
    HEADER="$TMP_DIR/rtl-header.js"
    cp "$PAYLOAD_FILE" "$HEADER"
    build_font_injector "$HEADER"

    # --- Inject into every renderer bundle except the Electron main entry ---
    step "Injecting RTL code..."
    BUILD_DIR="$TMP_DIR/app/.vite/build"
    [ -d "$BUILD_DIR" ] || die ".vite/build/ not found — Claude Desktop structure changed."
    MAIN_BASENAME=""
    if [ -f "$TMP_DIR/app/package.json" ]; then
        MAIN_ENTRY=$(node -p "require('$TMP_DIR/app/package.json').main || ''" 2>/dev/null || echo "")
        [ -n "$MAIN_ENTRY" ] && MAIN_BASENAME=$(basename "$MAIN_ENTRY")
    fi
    INJECTED=0; SKIPPED=0
    for js_file in "$BUILD_DIR"/*.js; do
        [ -f "$js_file" ] || continue
        if [ -n "$MAIN_BASENAME" ] && [ "$(basename "$js_file")" = "$MAIN_BASENAME" ]; then
            log "Skipping $(basename "$js_file") (Electron main process)"
            SKIPPED=$((SKIPPED + 1)); continue
        fi
        if grep -q "CLAUDE RTL PATCH START" "$js_file" 2>/dev/null; then
            if [ "$FORCE" = "1" ]; then
                # Strip the previous RTL/FONT header so the new payload applies.
                python3 - "$js_file" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8", errors="replace").read()
start = s.find("// --- CLAUDE RTL PATCH START ---")
if start != -1:
    end = max(s.rfind("// --- CLAUDE RTL FONT END ---"),
              s.rfind("// --- CLAUDE RTL PATCH END ---"))
    if end != -1:
        end += len("// --- CLAUDE RTL FONT END ---")
        s = s[:start] + s[end:]
        open(p, "w", encoding="utf-8").write(s)
PY
                log "Re-injecting $(basename "$js_file") (force)"
            else
                SKIPPED=$((SKIPPED + 1)); continue
            fi
        fi
        cat "$HEADER" "$js_file" > "$TMP_DIR/merged.js"
        mv "$TMP_DIR/merged.js" "$js_file"
        INJECTED=$((INJECTED + 1))
    done
    if [ "$INJECTED" -eq 0 ] && [ "$SKIPPED" -eq 0 ]; then
        die "No .js files found in .vite/build/ — structure changed."
    fi
    [ "$INJECTED" -gt 0 ] && success "Injected RTL JS into $INJECTED file(s)."
    [ "$SKIPPED" -gt 0 ] && log "Skipped $SKIPPED file(s) (main process / already patched)."

    # --- Repack ASAR ---
    step "Repacking app.asar..."
    asar_cmd pack "$TMP_DIR/app" "$TMP_DIR/app.asar.new"
    cp "$TMP_DIR/app.asar.new" "$ASAR"
    success "Repacked."

    # --- Disable ASAR integrity fuse (required, archive hash changed) ---
    step "Disabling ASAR integrity validation..."
    fuses_cmd write --app "$APP" EnableEmbeddedAsarIntegrityValidation=off 2>&1 | while IFS= read -r line; do log "$line"; done
    success "ASAR integrity fuse disabled."

    # --- Re-sign ad-hoc (preserving entitlements) ---
    step "Re-signing with ad-hoc signature..."
    if [ -n "$ENT" ]; then
        codesign --force --deep --sign - --entitlements "$ENT" "$APP" 2>&1 | while IFS= read -r line; do log "$line"; done
    else
        codesign --force --deep --sign - "$APP" 2>&1 | while IFS= read -r line; do log "$line"; done
    fi
    success "App re-signed."

    rm -rf "$TMP_DIR" 2>/dev/null || true; TMP_DIR=""

    echo -e "\n${BOLD}${GREEN}=========================================================${NC}"
    echo -e "${BOLD}${GREEN}   LIVE PATCH INSTALLED — Claude.app is now RTL${NC}"
    echo -e "${BOLD}${GREEN}=========================================================${NC}"
    if [ -n "$BACKUP" ]; then
        echo ""
        echo "  Backup (original, Anthropic-signed): $BACKUP"
        echo "  Restore: ./patch-live.sh --restore"
    fi
    echo ""
    echo "  Next steps:"
    echo "   • macOS may ask once about 'Claude Safe Storage' in Keychain — approve it."
    echo "   • If the window is blank on first launch, quit and reopen (one-time)."
    echo "   • CC Switch providers + Code tab work exactly like before the patch."
    echo "   • After each Claude auto-update, re-run: ./patch-live.sh --install"
    echo ""
}

restore_live() {
    echo -e "\n${BOLD}${CYAN}► Restoring original Claude.app from backup...${NC}\n"
    [ -d "$BACKUP" ] || die "No backup found at $BACKUP."

    local backup_version app_version
    backup_version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$BACKUP/Contents/Info.plist" 2>/dev/null || echo "unknown")
    app_version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null || echo "unknown")
    echo "  Current Claude.app version: $app_version"
    echo "  Backup version:            $backup_version"
    [ "$backup_version" != "unknown" ] && [ "$app_version" != "unknown" ] || die "Could not read app versions; refusing to restore."

    if awk -v older="$backup_version" -v newer="$app_version" 'BEGIN {
        no = split(older, o, "."); nn = split(newer, n, ".")
        for (i = 1; i <= (no > nn ? no : nn); i++) {
            ov = o[i] + 0; nv = n[i] + 0
            if (ov < nv) exit 0
            if (ov > nv) exit 1
        }
        exit 1
    }'; then
        warn "Restoring this backup would downgrade Claude.app."
        read -r -p "  Type YES to continue: " confirm
        [ "$confirm" = "YES" ] || die "Restore aborted; Claude.app was not changed."
    fi

    quit_claude
    rm -rf "$APP"
    cp -R "$BACKUP" "$APP"
    success "Restored $APP from $BACKUP"
    echo "  The app is back to its original Anthropic-signed state."
    echo "  Keep or delete the backup: rm -rf \"$BACKUP\""
}

status_live() {
    echo ""
    echo -e "${BOLD}Claude Desktop RTL Live Patch — Status${NC}"
    echo ""
    [ -d "$APP" ] && echo "  Claude.app: installed ($(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist" 2>/dev/null || echo unknown))"
    [ -d "$BACKUP" ] && echo "  Backup: exists at $BACKUP (version $(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$BACKUP/Contents/Info.plist" 2>/dev/null || echo unknown))" || echo "  Backup: none"
    if is_already_patched; then
        echo -e "  ${GREEN}[+] RTL patch: ACTIVE (fuse disabled)${NC}"
    else
        echo -e "  ${YELLOW}[!] RTL patch: not applied${NC}"
    fi
    if [ -d "$RTL_APP_DEST" ]; then
        local v=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$RTL_APP_DEST/Contents/Info.plist" 2>/dev/null || echo unknown)
        local n=$(grep -c "CLAUDE RTL PATCH START" "$RTL_APP_DEST/Contents/Resources/app.asar" 2>/dev/null || echo 0)
        echo "  RTL copy ($RTL_APP_DEST): version $v"
        [ -n "$n" ] && [ "$n" -gt 0 ] 2>/dev/null && echo -e "    ${GREEN}[+] patched${NC}" || echo -e "    ${YELLOW}[!] not patched${NC}"
    else
        echo "  RTL copy ($RTL_APP_DEST): none (use --make-rtl to create)"
    fi
    echo ""
}

FORCE=0
ACTION=""
RTL_APP_DEST="${RTL_APP_DEST:-$HOME/Applications/Claude-RTL.app}"
usage() {
    echo "Usage: ./patch-live.sh [--install] [--font NAME] [--force] | --make-rtl | --restore | --status"
    echo ""
    echo "  --install      Patch /Applications/Claude.app IN PLACE (RTL only, minimal)."
    echo "  --make-rtl     Copy /Applications/Claude.app (original) -> \$HOME/Applications/"
    echo "                 Claude-RTL.app and patch the COPY. The original stays clean"
    echo "                 (Anthropic-signed) so auto-updates keep working; re-run this"
    echo "                 after every update to refresh the RTL app."
    echo "                 (override destination with RTL_APP_DEST=path)"
    echo "  --restore      Restore the original app from the backup."
    echo "  --status       Show whether the live patch is applied."
    echo "  --font NAME    Also apply NAME as the app-wide font (e.g. Vazirmatn, bundled)."
    echo "  --force        Strip the previous patch header and re-inject (use after"
    echo "                 updating the payload, e.g. a new font rule)."
}
while [ $# -gt 0 ]; do
    case "$1" in
        --install)   ACTION="install" ;;
        --make-rtl)  ACTION="make-rtl" ;;
        --restore)   ACTION="restore" ;;
        --status)    ACTION="status" ;;
        --force)     FORCE=1 ;;
        --font)      [ $# -lt 2 ] && { err "--font requires a name (e.g. Vazirmatn)"; exit 1; }
                     RTL_FONT_FAMILY="$2"; shift ;;
        --font=*)    RTL_FONT_FAMILY="${1#--font=}" ;;
        --help|-h)   usage; exit 0 ;;
        *)           err "Unknown option: $1"; usage; exit 1 ;;
    esac
    shift
done
case "$ACTION" in
    install)  install_live ;;
    make-rtl) make_rtl_app ;;
    restore)  restore_live ;;
    status)   status_live ;;
    *)        usage; exit 1 ;;
esac

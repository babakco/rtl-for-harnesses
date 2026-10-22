#!/bin/bash
# Qoder-RTL patcher — v3.2 (Qoder 0.4.2+)
# هر بار از روی /Applications/Qoder.app یک نسخه تازه می‌سازد:
#   /Applications/Qoder-RTL.app
# تغییرات: پاراگراف/جمله‌ای که حتی یک کلمه فارسی داشته باشد (حتی با شروع انگلیسی)
# در خروجی AI (دستیار + حباب کاربر + virtualized markdown)، ورودی کاربر
# (.loop-rich-editor کامپوزر جدید) و پیش‌نمایش فایل‌های Markdown در workspace
# (WorkspaceFileViewer/CodeMirror) => RTL + فونت وزیرمتن.
# کد (pre/code) و ادیتور کد LTR می‌ماند.
# v3.2: RTL روی کانتینر پایدار فایل (CodeMirror تغییرات داخل .cm-content را برمی‌گرداند)
# v3.1: + تب Source فایل‌های workspace + زمان‌بند مقاوم در پنجرهٔ مخفی (rAF نمی‌چرخد)
# v3.0: + پیش‌نمایش Markdown در workspace (خطوط cm-markdown در CodeMirror)
# v2.1: خاموش کردن «بررسی خودکار بروزرسانی» — دکمهٔ بررسی دستی سر جایش می‌ماند.
#      حذف app-update.yml حذف شد تا چک دستی واقعاً کار کند.
# v2.0: خروجی دستیار/حباب کاربر/کامپوزر 0.4.2 + انکر داینامیک (بدون هاردکد هش)
set -euo pipefail

SRC="/Applications/Qoder.app"
DST="/Applications/Qoder-RTL.app"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_ASAR="$SCRIPT_DIR/patch_asar.py"
CSS="$SCRIPT_DIR/rtl-fa.css"
JS="$SCRIPT_DIR/rtl-fa.js"
F_REG="$SCRIPT_DIR/vazirmatn-regular.woff2"
F_MED="$SCRIPT_DIR/vazirmatn-medium.woff2"
F_BOLD="$SCRIPT_DIR/vazirmatn-bold.woff2"
PATCH_VER="v3.2"
TMP="$(mktemp -d /tmp/qoder-rtl-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

log() { echo "[qoder-rtl] $*"; }
fail() { echo "[qoder-rtl][ERROR] $*" >&2; exit 1; }

[[ -d "$SRC" ]] || fail "Qoder اصلی پیدا نشد: $SRC"
command -v python3 >/dev/null || fail "python3 لازم است"
for f in "$PATCH_ASAR" "$CSS" "$JS" "$F_REG" "$F_MED" "$F_BOLD"; do
  [[ -f "$f" ]] || fail "فایل پچ پیدا نشد: $f"
done
node --check "$JS" >/dev/null 2>&1 || fail "خطای نحوی در rtl-fa.js"

SRC_VER="$(plutil -extract CFBundleShortVersionString raw "$SRC/Contents/Info.plist" 2>/dev/null || echo "?")"
log "نسخه Qoder اصلی: $SRC_VER (پچ $PATCH_VER)"

# ۱) کپی تازه (قابل تکرار بودن پچ: هر بار از صفر)
if [[ -e "$DST" ]]; then
  log "حذف نسخه قبلی Qoder-RTL..."
  rm -rf "$DST"
fi
log "کپی $SRC -> $DST ..."
cp -R "$SRC" "$DST"
xattr -cr "$DST" 2>/dev/null || true

ASAR="$DST/Contents/Resources/app.asar"
[[ -f "$ASAR" ]] || fail "app.asar پیدا نشد"

# ۲) ساخت index.html پچ‌شده (idempotent + داینامیک: بدون هاردکد هش)
log "ساخت index.html پچ‌شده..."
python3 - "$ASAR" "$TMP/index.html" <<'EOF'
import struct, json, sys, re
asar, out = sys.argv[1], sys.argv[2]
with open(asar,'rb') as f:
    a,b,c,d = struct.unpack('<IIII', f.read(16))
    hdr = json.loads(f.read(d).decode())
    aligned = (d+3)//4*4
    f.seek(16+aligned)
    data = f.read()
def find(node, path):
    for p in path.strip('/').split('/'):
        node = node['files'][p]
    return node
e = find(hdr, '/out/renderer/index.html')
html = data[int(e['offset']):int(e['offset'])+int(e['size'])].decode('utf-8')
if 'rtl-fa.js' not in html:
    inject = '<link rel="stylesheet" href="./rtl-fa.css">\n    <script src="./rtl-fa.js" defer></script>'
    # حالت ۱: بعد از آخرین <link rel=stylesheet ... index-*.css>
    m = list(re.finditer(r'<link rel="stylesheet"[^>]*href="\./assets/index-[^"]+\.css"[^>]*>', html))
    if m:
        last = m[-1]
        pos = last.end()
        html = html[:pos] + '\n    ' + inject + html[pos:]
        print('anchor: after index-*.css')
    elif '</head>' in html:
        html = html.replace('</head>', '    ' + inject + '\n  </head>', 1)
        print('anchor: fallback </head>')
    else:
        raise SystemExit('no </head> found for injection')
    html = html.replace('</head>', '  <!-- qoder-rtl v3.2 -->\n  </head>', 1) if 'qoder-rtl v3.2' not in html else html
else:
    print('already injected, skipping')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print('index.html ready', len(html))
EOF

# ۲ب) خاموش کردن «بررسی خودکار بروزرسانی» در پروسهٔ اصلی
# اسکیولدر پس‌زمینه با {enabled:c} ثبت می‌شود که در عمل همیشه true است
# (روی مک installType همیشه "user" برمی‌گردد). با false کردن آن:
#   - هیچ چک خودکاری در استارتاپ یا هنگام فوکوس پنجره انجام نمی‌شود
#   - دکمهٔ «بررسی بروزرسانی» در تنظیمات دستی همچنان کار می‌کند
#   - تابع S6e و ثبت پروتکل (qoder://) دست‌نخورده می‌مانند
log "غیرفعال کردن بررسی خودکار بروزرسانی..."
python3 - "$ASAR" "$TMP/main.js" <<'EOF'
import struct, json, sys
asar, out = sys.argv[1], sys.argv[2]
with open(asar,'rb') as f:
    a,b,c,d = struct.unpack('<IIII', f.read(16))
    hdr = json.loads(f.read(d).decode())
    aligned = (d+3)//4*4
    f.seek(16+aligned)
    data = f.read()
def find(node, path):
    for p in path.strip('/').split('/'):
        node = node['files'][p]
    return node
e = find(hdr, '/out/main/index.js')
js = data[int(e['offset']):int(e['offset'])+int(e['size'])].decode('utf-8')
anchor = 'l.set(P_e,new We(Yde,[{enabled:c}]))'
patched = 'l.set(P_e,new We(Yde,[{enabled:!1}]))/*qoder-rtl:auto-update-off*/'
if 'qoder-rtl:auto-update-off' in js:
    print('already patched, skipping')
elif js.count(anchor) != 1:
    print(f'anchor not found in this Qoder build ({js.count(anchor)} matches) — leaving main.js untouched')
else:
    js = js.replace(anchor, patched, 1)
    print('auto-update scheduler disabled')
with open(out, 'w', encoding='utf-8') as f:
    f.write(js)
print('main.js ready', len(js))
EOF
node --check "$TMP/main.js" >/dev/null 2>&1 || fail "خطای نحوی در main.js پچ‌شده"

# ۳) تزریق جراحی به asar (unpackedها دست نخورده می‌مانند)
log "تزریق فایل‌های RTL به app.asar (جراحی، بدون دست‌زدن به nativeها)..."
python3 "$PATCH_ASAR" "$ASAR" "$TMP/app.asar" \
  --replace "out/renderer/index.html=$TMP/index.html" \
  --replace "out/main/index.js=$TMP/main.js" \
  --add "out/renderer/rtl-fa.css=$CSS" \
  --add "out/renderer/rtl-fa.js=$JS" \
  --add "out/renderer/assets/vazirmatn-regular.woff2=$F_REG" \
  --add "out/renderer/assets/vazirmatn-medium.woff2=$F_MED" \
  --add "out/renderer/assets/vazirmatn-bold.woff2=$F_BOLD"
mv "$TMP/app.asar" "$ASAR"

# ۴) Info.plist نسخه RTL:
# - CFBundleIdentifier جدا (اجرای مستقل/هم‌زمان)
# - CFBundleDisplayName برای نمایش Qoder-RTL در Dock/Finder
# - ⚠️ CFBundleName باید "Qoder" بماند! الکترون Helperها را از روی آن پیدا می‌کند
#   (Frameworks/Qoder Helper*.app) و تغییرش باعث کرش "Unable to find helper app" می‌شود.
log "به‌روزرسانی Info.plist..."
plutil -replace CFBundleIdentifier -string "com.qoder.app.rtl" "$DST/Contents/Info.plist"
plutil -replace CFBundleDisplayName -string "Qoder-RTL" "$DST/Contents/Info.plist"
python3 - "$DST/Contents/Info.plist" <<'EOF'
import plistlib, sys
p = sys.argv[1]
with open(p, 'rb') as f:
    info = plistlib.load(f)
info['CFBundleURLTypes'][0]['CFBundleURLSchemes'] = ['qoder-rtl', 'qoder-rtl-app']
info['CFBundleURLTypes'][0]['CFBundleURLName'] = 'Qoder-RTL'
with open(p, 'wb') as f:
    plistlib.dump(info, f)
print('URL schemes ->', info['CFBundleURLTypes'][0]['CFBundleURLSchemes'])
EOF
# app-update.yml را دست نمی‌زنیم: چک خودکار در مرحلهٔ ۲ب خاموش شده و
# دکمهٔ بررسی دستی برای کار کردن به همین فایل نیاز دارد.
log "به‌روزرسانی هش ElectronAsarIntegrity..."
NEW_HASH="$(python3 - "$ASAR" <<'EOF'
import struct, hashlib, sys
with open(sys.argv[1],'rb') as f:
    a,b,c,d = struct.unpack('<IIII', f.read(16))
    print(hashlib.sha256(f.read(d)).hexdigest())
EOF
)"
plutil -replace ElectronAsarIntegrity -json "{\"Resources/app.asar\":{\"algorithm\":\"SHA256\",\"hash\":\"$NEW_HASH\"}}" "$DST/Contents/Info.plist"
log "هش جدید asar: $NEW_HASH"

# ۵) امضای ad-hoc
log "امضای مجدد (ad-hoc)..."
codesign --force --deep --sign - "$DST" 2>&1 | tail -1 || true
xattr -cr "$DST" 2>/dev/null || true

# ۶) راستی‌آزمایی
log "راستی‌آزمایی..."
codesign -v "$DST" 2>&1 && log "codesign: OK" || log "codesign: هشدار (اولین اجرا را با راست‌کلیک > Open انجام دهید)"
npx --yes @electron/asar list "$ASAR" 2>/dev/null | grep -E "rtl-fa|vazirmatn" || log "هشدار: فایل‌های RTL در asar دیده نشدند"

# بررسی صحت asar: هر فایل packed باید هَش خودش (کل و تکه‌ای) را پاس کند
log "بررسی صحت asar..."
python3 - "$ASAR" <<'EOF' || fail "هَش داخلی asar نادرست است"
import struct, json, hashlib, sys
with open(sys.argv[1],'rb') as f:
    a,b,c,d = struct.unpack('<IIII', f.read(16))
    hdr = json.loads(f.read(d).decode())
    base = 8 + b
def walk(n, pre=''):
    for k,e in n.get('files',{}).items():
        p = pre + '/' + k
        if 'files' in e: yield from walk(e,p)
        else: yield p,e
bad = []; n = 0
for p,e in walk(hdr):
    if e.get('unpacked') or 'link' in e: continue
    n += 1
    integ = e.get('integrity')
    if not integ: continue
    with open(sys.argv[1],'rb') as f:
        f.seek(base + int(e['offset'])); data = f.read(int(e['size']))
    if 'blocks' in integ:
        bs = integ.get('blockSize', 4194304)
        ok = all(hashlib.sha256(data[i:i+bs]).hexdigest() == h
                 for i,h in zip(range(0, len(data), bs), integ['blocks']))
    else:
        ok = hashlib.sha256(data).hexdigest() == integ['hash']
    if not ok: bad.append(p)
if bad:
    print('  نادرست:', *bad[:5], sep='\n  ')
    raise SystemExit(1)
print(f'  {n} فایل packed — همه هَش‌ها درست')
EOF

# تأیید اینکه پچ واقعاً داخل بیلد نهایی نشسته است
log "تأیید اعمال پچ..."
python3 - "$ASAR" <<'EOF' || fail "پچ داخل asar نهایی اعمال نشده"
import struct, json, sys
with open(sys.argv[1],'rb') as f:
    a,b,c,d = struct.unpack('<IIII', f.read(16))
    hdr = json.loads(f.read(d).decode())
    base = 8 + b
def find(node, path):
    for p in path.strip('/').split('/'):
        node = node['files'][p]
    return node
def read(path):
    e = find(hdr, path)
    with open(sys.argv[1],'rb') as f:
        f.seek(base + int(e['offset']))
        return f.read(int(e['size']))
main = read('/out/main/index.js').decode('utf-8')
html = read('/out/renderer/index.html').decode('utf-8')
checks = [
    ('تزریق rtl-fa.js در index.html', 'rtl-fa.js' in html),
    ('خاموشی چک خودکار آپدیت (اختیاری)', 'qoder-rtl:auto-update-off' in main),
]
for name, ok in checks:
    if name.startswith('تزریق'):
        print(f'  {"OK " if ok else "FAIL"}  {name}')
        if not ok: raise SystemExit(1)
    else:
        print(f'  {"OK " if ok else "SKIP"}  {name}')
EOF
[[ -f "$DST/Contents/Resources/app-update.yml" ]] || fail "app-update.yml ناقص است (بررسی دستی کار نمی‌کند)"
log "app-update.yml: موجود (بررسی دستی فعال است)"

cat <<EOF

==============================================
 ✅ تمام شد! Qoder-RTL ساخته شد:
    $DST
    (نسخه پایه Qoder: $SRC_VER — پچ $PATCH_VER — هر دو در Application هستند)
----------------------------------------------
 • تست دستیار: در چت بنویسید:
     Hello this is English ولی این جمله فارسی است
   => همان پاراگراف باید راست‌چین + فونت وزیرمتن شود،
      حتی با اینکه با انگلیسی شروع شده.
   => پاراگراف کاملاً انگلیسی باید چپ‌چین بماند.
   => بلوک کد باید چپ‌چین بماند.
 • تست فایل workspace: یک فایل متنی/فارسی (md یا txt) را در پنل راست باز کنید
   => تب Source (پیش‌فرض): خطوط فارسی راست‌چین + وزیرمتن می‌شوند.
   => تب Preview: متن فارسی راست‌چین، نقل‌قول لبهٔ راست، جدول راست‌چین،
      بلوک کد LTR.
   => فایل کد (py/ts/js/...) همیشه LTR می‌ماند.
 • تست حباب کاربر (جدید در 0.4.2): یک پیام فارسی بفرستید —
   حباب آبی/خاکستری شما باید راست‌چین + وزیرمتن شود،
   اما جای حباب (راست) عوض نشود.
 • تست کامپوزر (جدید): در باکس ورودی فارسی بنویسید —
   ورودی باید راست‌چین شود؛ منشن @file چپ‌چین می‌ماند.
  • کنسول DevTools باید "[qoder-rtl] active v3.2.0" را نشان دهد.
 • بروزرسانی (v2.1): چک خودکار خاموش است — نه ۳۰ ثانیه بعد از
   اجرا، نه هنگام فوکوس پنجره. بررسی دستی سر جایش است:
   تنظیمات ← بررسی بروزرسانی. در لاگ باید این خط را ببینید:
     [DesktopUpdateScheduler] Background Desktop update checks are disabled
 • پچ مجدد بعد از آپدیت Qoder: همین اسکریپت را دوباره اجرا کنید:
     bash "$SCRIPT_DIR/patch-qoder-rtl.sh"
   (اسکریپت هر بار از صفر از روی Qoder.app می‌سازد، پس تکرارپذیر است)
 • نکته: هر دو نسخه پوشهٔ دادهٔ مشترک دارند (com.qoder.app.stable)؛
   هم‌زمان هر دو را باز نکنید.
==============================================
EOF

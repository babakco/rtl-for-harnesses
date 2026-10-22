# OpenCode RTL Patch — Agent Handoff (export)

این فولدر همه‌چیز لازم برای ساخت نسخه RTL اپ دسکتاپ **opencode** روی یک
ماشین دیگر (macOS) را دارد. کافی است همین فولدر را به ایجنت/ماشین مقصد
بدهی؛ نیازی به سورس opencode نیست.

## ۱. محتویات فولدر

| فایل | نقش | sha256 (هنگام export) |
|---|---|---|
| `apply-rtl-patch.mjs` | اسکریپت اصلی: دانلود/نصب نسخه رسمی (فید v2)، بکاپ تمیز خودکار، اعمال پچ، به‌روزرسانی `ElectronAsarIntegrity`، امضای ad-hoc، تأیید نهایی | `e25fc51e375140ce32897545375b4b0de8f5db7afaf0935e144c7688b42fcfb3` |
| `rtl-patch-official.mjs` | پچر سطح پایین: تغییر JS/CSS داخل `app.asar` بازشده (شامل لایه ایزولاسیون `--rtl2`) | `76975de9bed9c7477ce302d5e7d64cdf505ce10596f7dd1431206262c4fdc99d` |
| `rtl2-icon.py` | ساخت آیکون نسخه دوم (بج کهربایی «۲» روی icns خود اپ؛ نیازمند python3 + Pillow) | `610aa7b3b6940a52cd3efe2a34083d9c23ca6676b07c1c9a28c216c3d998b513` |
| `RTL-PATCH.md` | مستندات کامل جریان کاری + اینواریانت‌های RTL (و بخش RTL-2) | `4cefbd55ac096565a2545d23e9eb3a577f5ef853366ae57dcca08d92eb0de40a` |
| `SOURCE-PATCH-SPEC.md` | اسپک ۸ پچ سورس + مراحل بیلد از سورس (**فقط** برای بیلد سورسی؛ مسیر عادی به آن نیازی ندارد) | این فایل هنگام export ساخته شد |
| `README.md` | همین راهنما | — |

صحت فایل‌ها را با دستور زیر چک کن (هش‌ها باید با جدول بالا بخوانند):

```sh
shasum -a 256 apply-rtl-patch.mjs rtl-patch-official.mjs RTL-PATCH.md
node --check apply-rtl-patch.mjs && node --check rtl-patch-official.mjs && echo SCRIPTS-OK
```

نسخه‌های تست‌شده هنگام export: **1.18.32 تا 1.18.35** (mac-arm64).
پچر طوری نوشته شده که روی نسخه‌های جدیدتر هم تلاش می‌کند؛ اگر ساختار
باندل عوض شده باشد با خطای صریح (`Missing …` / `Ambiguous …`) می‌ایستد —
بخش ۷ (عیب‌یابی) را ببین.

## ۲. پیش‌نیازهای ماشین مقصد

1. **macOS** (اسکریپت فعلاً فقط macOS را پشتیبانی می‌کند).
2. **Node.js نسخه 22.12 یا جدیدتر**: `node --version`
3. **دسترسی شبکه یا کش npx** برای بسته `@electron/asar`
   (فرمان‌های asar از طریق `npx --yes @electron/asar` اجرا می‌شوند).
4. **اپ رسمی OpenCode نصب‌شده** در `/Applications/OpenCode.app`
   (یا با `--update` خودش دانلود و نصب می‌شود).
5. **فونت Vazirmatn نصب‌شده** در سیستم (`~/Library/Fonts/Vazirmatn[wght].ttf`
   یا از مخزن رسمی `rastikerdar/vazirmatn` / گوگل فونتس). بدون این فونت،
   متن‌ها با فونت جایگزین نمایش داده می‌شوند ولی جهت‌ها درست می‌مانند.
6. برای بالا بردن سقف rate-limit گیت‌هاب (اختیاری):
   `export GH_TOKEN=...` یا `GITHUB_TOKEN`.

## ۳. شروع سریع (مسیر پیشنهادی: split layout)

> قبل از اجرا، اپ OpenCode را کامل ببند (Quit). بعد از اتمام، دستی اجرا کن.

```sh
# ۱) وضعیت: نسخه نصب‌شده در برابر جدیدترین نسخه رسمی
node apply-rtl-patch.mjs --check

# ۲) ساخت/به‌روزرسانی هر دو نسخه RTL — اگر بکاپ تمیز موجود نباشد، خودکار از اپ رسمی ساخته می‌شود
node apply-rtl-patch.mjs --update --rtl-app /Applications/OpenCode-RTL.app --rtl2-app /Applications/OpenCode-RTL-2.app

# ۳) تأیید امضای هر دو نسخه
codesign --verify --deep --strict /Applications/OpenCode-RTL.app && codesign --verify --deep --strict /Applications/OpenCode-RTL-2.app && echo SIGNATURE-OK
```

نتیجه نهایی در `/Applications`:

```text
OpenCode.app                  # رسمی، دست‌نخورده (امضای Developer ID)
OpenCode-RTL.app              # وصله‌شده، مصرف روزانه (امضای ad-hoc)
OpenCode-RTL-2.app            # نسخه دوم مستقل (ad-hoc، داده/کانفیگ/سرویس جدا)
OpenCode-original-vX.Y.Z.app  # بکاپ تمیز هر نسخه (مبنای پچ)
```

## ۴. مرجع فرمان‌ها

```sh
node apply-rtl-patch.mjs [--app /Applications/OpenCode.app] [--update | --version X.Y.Z | --check] [--rtl-app /Applications/OpenCode-RTL.app] [--rtl2-app /Applications/OpenCode-RTL-2.app] [--keep-temp]

(no flags)         پچ نسخه نصب‌شده بدون دانلود (آفلاین)
--update           اول به جدیدترین ریلیز رسمی برو (فید v2 روی opencode.ai، راستی‌آزمایی sha512 + امضای Developer-ID)، بعد پچ
--version X.Y.Z    مثل update ولی پین‌شده به نسخه مشخص (دانگرید هم مجاز)
--check            فقط چاپ نسخه نصب‌شده در برابر جدیدترین رسمی، بدون هیچ تغییری
--rtl-app PATH     چیدمان جدا: --app رسمی می‌ماند و کپی وصله‌شده در PATH ساخته می‌شود
--rtl2-app PATH    نسخه دوم کاملاً مستقل (RTL-2): همان پچ‌ها + bundle id/نام جدا،
                   کاربر‌دیتای اختصاصی (ai.opencode.desktop.rtl2) و XDGهای جدا داخل آن،
                   daemon روی پورت 49375 در کنار سرویس اصلی 49374 (هر دو همزمان اجرا می‌شوند)
--app PATH         مسیر دیگر اپ (پیش‌فرض /Applications/OpenCode.app، یا متغیر OPENCODE_APP)
--keep-temp        نگه‌داشتن فایل‌های موقت برای عیب‌یابی
```

نکته‌ها:
- هر اجرا از **بکاپ تمیز همان نسخه** شروع می‌کند، پس اجرای مکرر بی‌خطر است
  و جایگزینی رشته تکراری انباشته نمی‌شود.
- از بکاپی که خودش وصله دارد بکاپ ساخته نمی‌شود (محافظت در برابر آلودگی).
- اگر بکاپ تمیز آن نسخه موجود نباشد، خودکار از اپ رسمی نصب‌شده ساخته می‌شود
  (نیازمند امضای Developer-ID؛ حتی بعد از آپدیت داخلی خود اپ رسمی).
- خودِ auto-update داخل اپ را خاموش/نادیده بگیر: آپدیت داخلی، آرشیو وصله‌شده
  را جایگزین می‌کند؛ بعدش همین اسکریپت را دوباره اجرا کن.
- نسخه‌های رسمی، `OpenCode-RTL.app` و `OpenCode-RTL-2.app` می‌توانند همزمان
  اجرا شوند؛ هر کدام سرویس پس‌زمینه خودش را دارد (49374 / 49375).
- نسخه دوم آیکون متفاوت دارد (بج کهربایی «۲» از طریق `rtl2-icon.py`؛ نیازمند
  python3 + Pillow).

## ۵. پچ دقیقاً چه می‌کند (پوشش)

`rtl-patch-official.mjs` روی `out/renderer/assets/main-*.js|css` داخل asar:

1. **کامپوزر V2**: تشخیص جهت در JS (هر کاراکتر فارسی ⇒ کل ورودی RTL)،
   فونت `16px` + `font-sans` (با پین inline چون Tailwind پسابیلد کلاس جدید نمی‌سازد).
2. **خروجی مدل (markdown)**: ست‌کردن صریح `dir` روی هر بلوک در JS؛
   `text-align: start` در CSS؛ `pre/.shiki` همیشه LTR.
3. **حباب پیام کاربر**: `dir` واکنشی + حذف `unicode-bidi: plaintext`.
4. **سؤالات چندگزینه‌ای مدل** (`session-question-dock` + پاسخ‌های ثبت‌شده):
   `dir` صریح روی متن سؤال/دکمه گزینه/textarea پاسخ سفارشی via
   `MutationObserver` (`DOCK_TEXT_RTL`)؛ چیدمان داک LTR می‌ماند.
5. **لیست todo مدل** (تایم‌لاین `todos` + `session-todo-dock`): همان مکانیزم بالا.
6. **نمایش فایل سایدبار** (مثل `.md` راهنماها): فقط پسوندهای داکیومنت
   (`md/markdown/txt/rst/adoc/...`) و فقط وقتی محتوا کاراکتر فارسی دارد —
   دو لایه: پرچم `data-rtl` + متغیرهای CSS در shadow DOM، و ست‌کردن مستقیم
   `dir` روی `[data-line]`ها (`observePierreDocViewers`).
7. **فونت سراسری Vazirmatn** اول در استک sans (و V2 و Pierre)؛ کد/دیف مونو می‌مانند.
8. **لایه `--rtl2`**: ایزولاسیون کامل نسخه دوم — bundle id/userData/XDG جدا
   (`ai.opencode.desktop.rtl2`)، helperهای بازنام‌گذاری‌شده، daemon روی پورت `49375`،
   و آیکون بج‌دار «۲».

قوانین طلایی (از `RTL-PATCH.md`): جهت همیشه در **JS** تعیین می‌شود، هرگز
`unicode-bidi: plaintext` روی این بلوک‌ها؛ کد، دیف، شماره خط و شل همیشه LTR.

## ۶. چک‌لیست تأیید بعد از بیلد

```sh
# نسخه‌ها یکسان‌اند؟
for a in OpenCode OpenCode-RTL; do /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "/Applications/$a.app/Contents/Info.plist"; done

# امضای RTL سالم و ad-hoc است؟
codesign --verify --deep --strict /Applications/OpenCode-RTL.app && echo SIGNATURE-OK

# امضای رسمی دست‌نخورده مانده؟ (باید Developer ID باشد، نه adhoc)
codesign -dvv /Applications/OpenCode.app 2>&1 | grep -E "Authority=|Signature=" | head -n 3

# مارکرهای RTL داخل asar نصب‌شده هستند؟
T=$(mktemp -d); npx --yes @electron/asar extract /Applications/OpenCode-RTL.app/Contents/Resources/app.asar "$T" >/dev/null 2>&1
A="$T/out/renderer/assets"
for pat in PROMPT_INPUT_RTL MARKDOWN_RTL MESSAGE_RTL DOCK_TEXT_RTL DOCUMENT_EXTENSIONS observePierreDocViewers 'Vazirmatn'; do printf "%-28s " "$pat"; cat "$A"/main-* | grep -c "$pat"; done
rm -rf "$T"

# مارکرهای ایزولاسیون نسخه دوم؟ (باید RTL2_ISOLATION و پورت 49375 دیده شود)
T2=$(mktemp -d); npx --yes @electron/asar extract /Applications/OpenCode-RTL-2.app/Contents/Resources/app.asar "$T2" >/dev/null 2>&1
grep -c "RTL2_ISOLATION" "$T2"/out/main/*.js | grep -v ":0"
grep -c "49375" "$T2"/out/main/*.js | grep -v ":0"
rm -rf "$T2"
```

تست چشمی: `OpenCode-RTL.app` را اجرا کن و این‌ها را با متن فارسی/ترکیبی چک کن:
ورودی پرامپت، خروجی مدل، حباب پیام، سؤال چندگزینه‌ای، todo، باز کردن
یک `.md` فارسی از سایدبار. برای نسخه دوم همین تست‌ها را در
`OpenCode-RTL-2.app` انجام بده (داده/کانفیگ زیر
`~/Library/Application Support/ai.opencode.desktop.rtl2/`).

## ۷. عیب‌یابی

| علامت | علت محتمل | راه‌حل |
|---|---|---|
| `Missing …` / `Ambiguous …` / `Patch verification failed: …` از پچر | ساختار باندل نسخه جدید عوض شده؛ لنگر متنی پیدا/یکتا نیست | `--keep-temp` بگذار، asar بازشده در tmp را با لنگر موردنظر مقایسه کن، `rtl-patch-official.mjs` را به‌روز کن (تابع `replaceOnce` عمداً سخت‌گیر است) |
| `spctl` اپ RTL را رد می‌کند | طبیعی است: امضای ad-hoc است | `codesign --verify --deep --strict` ملاک سلامت است، نه spctl |
| `Download failed` / خطای GitHub API | شبکه یا rate-limit | `GH_TOKEN` بگذار؛ یا بدون `--update` آفلاین پچ کن |
| متن فارسی با فونت سیستم نشان داده می‌شود | Vazirmatn نصب نیست | فونت را نصب و اپ را ری‌استارت کن |
| بعد از آپدیت داخلی اپ، RTL پرید | auto-update آرشیو را جایگزین کرد | همین اسکریپت را دوباره اجرا کن |
| `Refusing to create a backup from an already patched app` | بکاپ تمیز آن نسخه نیست و اپ فعلی وصله‌دار است | با `--update`/`--version` نسخه رسمی تمیز را دانلود و بکاپ بساز |

## ۸. بازگشت (rollback)

- بکاپ‌های `OpenCode-original-vX.Y.Z.app` را نگه دار؛ هر بیلد از همان‌ها
  شروع می‌شود و با حذف `OpenCode-RTL.app`، نسخه رسمی سالم می‌ماند.
- برای بازگشت کامل پچر به وضعیت export: همین فولدر مرجع است
  (هش‌های جدول بخش ۱).

## ۹. مسیر بیلد از سورس (اختیاری/پیشرفته)

فقط وقتی لازم است که تغییری در سورس لازم باشد. مراحل و ۸ پچ سورس در
`SOURCE-PATCH-SPEC.md` آمده. ⚠️ سه مورد آخر پچر آرشیو (سؤال چندگزینه‌ای،
todo، و لایه دوم shadow-DOM فایل) هنوز معادل سورسی در آن اسپک ندارند —
هشدار بالای همان فایل را بخوان و قبل از بیلد سورسی آن‌ها را پورت کن.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

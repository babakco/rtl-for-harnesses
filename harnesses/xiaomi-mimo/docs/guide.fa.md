# راهنمای پچ فارسی/راست‌چین Xiaomi MiMo AI (macOS)

> سند زندهٔ این پروژه برای هر ایجنتی که می‌خواهد پچ را **اعمال، به‌روزرسانی یا عیب‌یابی** کند.
> نسخهٔ payload فعلی: **v1.1.0** — تاریخچهٔ کامل در «گزارش تغییرات» همین فایل.

این پروژه یک **کپی وصله‌شده** از اپ نصب‌شده می‌سازد:

| مسیر | نقش |
|---|---|
| `/Applications/Xiaomi MiMo AI.app` | اپ اصلی — **هرگز دست نمی‌خورد** (امضا و آپدیت خودش سالم می‌ماند) |
| `/Applications/Xiaomi MiMo AI-RTL.app` | کپی وصله‌شده — رانندهٔ روزمرهٔ فارسی‌زبان |

هر پاراگراف/جمله‌ای که **حتی یک حرف فارسی/عربی** داشته باشد (حتی اگر با لاتین یا علائم شروع شود)، در **ورودی کاربر (composer)** و **خروجی مدل** راست‌چین + فونت وزیرمتن می‌شود. متن خالص انگلیسی چپ‌چین می‌ماند؛ کد، ترمینال و فرمول ریاضی دست نمی‌خورند.

---

## ۱. سریع‌ترین مسیر (فقط اجرا)

```bash
cd harnesses/xiaomi-mimo
npm test                       # ۱) تست رفتاری payload (باید 34/34 سبز شود)
bash patch-xiaomi-mimo-rtl.sh  # ۲) ساخت/نوسازی کامل اپ RTL (~۱ دقیقه)
```

اسکریپت خودش همه‌کار می‌کند: بستن کپیِ در حال اجرا، کپی تازه با `ditto`، وصلهٔ `app.asar`، به‌روزرسانی `Info.plist`، امضای ad-hoc، و **راستی‌آزمایی کامل** (در انتها باید `everything verified` چاپ شود). بعد از هر **آپدیت رسمی اپ اصلی** همین اسکریپت را دوباره اجرا کن — از صفر و تمیز بازسازی می‌کند (idempotent)، پس وصله هرگز روی هم انباشته نمی‌شود.

```bash
bash patch-xiaomi-mimo-rtl.sh --status   # وضعیت نصب + نسخهٔ payload داخل asar
bash patch-xiaomi-mimo-rtl.sh --no-sign  # رد شدن از امضا (برای دیباگ)
bash patch-xiaomi-mimo-rtl.sh --keep-temp   # نگه داشتن دایرکتوری موقت برای دیباگ
```

وضعیت نصب مشخص است. حالا معماری و یافته‌ها:

## ۲. فایل‌های پروژه و نقش هر کدام

| فایل | نقش | نکتهٔ ویرایش |
|---|---|---|
| `rtl-fa.js` | **payload اجرایی** رندرر: MutationObserver + اسکن input/focusin؛ تشخیص فارسی؛ اعمال/بازگردانی `dir` | نسخه در `var VERSION` + هدر. تغییر رفتار ⇒ نسخه بالا برود |
| `rtl-fa.css` | استایل `.mimo-rtl-fa` / `.mimo-rtl-input` + سه `@font-face` وزیرمتن | نسخه در هدر کامنت |
| `patch_asar.py` | وصله‌گر جراحی asar (فقط append؛ بدون unpack/repack) با `--list/--extract/--replace/--add/--hash` | مستقل از payload؛ به‌ندرت تغییر می‌کند |
| `patch-xiaomi-mimo-rtl.sh` | **فایل اجرایی خودکار**: کل خط لولهٔ ساخت کپی RTL + راستی‌آزمایی | نسخهٔ payload را از `rtl-fa.js` می‌خواند |
| `tests/rtl-payload.test.mjs` | ۳۴ تست رفتاری در jsdom (`npm test`) — بدون فریم‌ورک | برای رفتار جدید/رفع باگ تست اضافه کن |
| `fonts/vazirmatn-*.woff2` | وزیرمتن regular/medium/bold (پوشش فارسی با fontTools تأیید شده) | مقصد در asar: `out/renderer/assets/` |
| `package.json` | `npm test` / `npm run patch`؛ نسخه در `"version"` | همراه payload بالا برود |
| `GUIDE.md` (این فایل) | راهنمای زنده برای ایجنت بعدی | هر یافته/تغییر جدید را ثبت کن |

## ۳. معماری اپ (یافته‌های مهندسی معکوس)

- Electron 41 / Chromium 146، نسخهٔ اپ 26.922.222056، باندل `com.xiaomi.mimo.desktop-ai`.
- رندرر: `out/renderer/index.html` + باندل Vite؛ استریمینگ توکن‌به‌توکن؛ مارک‌داون با marked/remark؛ هایلایت با **shiki** (نه highlight.js)؛ ریاضی KaTeX.
- کامپوزر: `textarea.composer-input`؛ خروجی: `p/li/h1-h6/blockquote/td/...` و `div.whitespace-pre-wrap`.
- امضا: Developer ID شیائومی + notarized. `ElectronAsarIntegrity` در Info.plist = sha256 بایت‌های خام JSON هدر asar.
- نام‌های محیطی آپدیتر (از `main/index.mjs`): `MIMO_MAC_AUTOUPDATE=0` و `MIMO_UPDATE_URL`.

## ۴. چرا unpack/repack کامل غیرممکن است (یافتهٔ کلیدی)

- asar اصلی ۱۹۰۵ ورودی دارد (۱۷۸۳ packed + ۱۲۲ unpacked) ولی فقط فایل‌های darwin داخلش هست — یعنی با ابزار استاندارد نمی‌شود کامل بازش کرد و دوباره بست.
- راه‌حل: **`patch_asar.py` فقط append می‌کند** — بایت‌های اصلی دست‌نخورده می‌مانند، فایل‌های جدید (index.html جدید، rtl-fa.js/css، ۳ فونت) به انتهای body اضافه و جدول JSON هدر بازنویسی می‌شود با offset/size/integrity جدید.
- بایت‌های مردهٔ نسخهٔ قدیمی index.html داخل آرشیو می‌مانند (~۷KB) — بی‌ضرر و عمدی (امنیت > زیبایی).
- هش هدر = `sha256` بایت‌های خام JSON (json_size در آفست ۱۲). دستور: `python3 patch_asar.py app.asar --hash`.

## ۵. کدام قسمت‌ها را تغییر دادیم (خلاصهٔ جراحی)

داخل `app.asar` (فقط در کپی RTL):
1. `out/renderer/index.html` — تزریق سه خط قبل از `</head>`: `<!-- mimo-rtl -->` + `<link ./rtl-fa.css>` + `<script ./rtl-fa.js defer>`.
2. `out/renderer/rtl-fa.js` — جدید (payload، بخش ۶).
3. `out/renderer/rtl-fa.css` — جدید (بخش ۷).
4. `out/renderer/assets/vazirmatn-{regular,medium,bold}.woff2` — جدید (~۱۵۳KB هر سه).

داخل `Info.plist` (فقط کپی RTL):
5. `ElectronAsarIntegrity["Resources/app.asar"].hash` ← هش جدید؛ وگرنه Electron با خطای `Failed to get integrity for validatable asar` بالا نمی‌آید.
6. `CFBundleDisplayName` ← `Xiaomi MiMo AI-RTL` (فقط نمایشی). `CFBundleName` و `CFBundleIdentifier` و `CFBundleExecutable` **عیناً** می‌مانند — وگرنه Helperها پیدا نمی‌شوند و پروفایل مشترک (لاگین/چت) از دست می‌رود.
7. `LSEnvironment` ← `MIMO_MAC_AUTOUPDATE=0` + `MIMO_UPDATE_URL=http://127.0.0.1:9/manifest.json` (+ حفظ `MallocNanoZone=0`)؛ یعنی آپدیتر این کپی خاموش است تا آپدیت رسمی وصله را پاک نکند.
8. حذف `Contents/Resources/app-update.yml` (کمربند اضافه برای electron-updater).
9. امضای مجدد ad-hoc با `--deep --options runtime` + همان entitlements اصلی (JIT، حافظهٔ اجرایی، audio-input).

اپ اصلی: **صفر تغییر** (هش asar ‏`10f3a5e7…f0376`‏، امضای Developer ID و notarize سالم).

## ۶. منطق payload ‏(`rtl-fa.js`)‏ — چه می‌کند و چرا این‌طور نوشته شده

- **تشخیص فارسی** با رجکس یونیکد: `0600-06FF` (حروف + ارقام فارسی) + `0750-077F` + `08A0-08FF` + `FB50-FDFF` + `FE70-FEFF` + `200C/200D` (نیم‌فاصله). فقط *وجود* یک حرف کافی است — حتی اگر جمله با لاتین/عدد/علائم شروع شده باشد (`unicode-bidi: embed` روی ورودی، نه `plaintext`).
- **بلاک‌ها**: `p/li/h1-h6/blockquote/dt/dd/td/th/figcaption/...` همیشه؛ `div/span/section/...` فقط وقتی همهٔ فرزندان المنت inline باشند (صاحب جمله بودن)؛ والد دارای دکمه/کنترل (toolbar) هرگز flip نمی‌شود تا چیدمان flex به‌هم نریزد. `li` فارسی ⇒ `ul/ol` والد هم RTL تا بولت/شماره سمت راست بیاید.
- **هرگز دست نزن**: `SKIP_SELECTOR = pre,code,kbd,samp,tt,var,script,style,noscript,canvas,math, .monaco-editor,.xterm,.cm-editor,.cm-content,.katex,.katex-display, .hljs,.shiki,.prismjs,.code-block,.codeblock, mjx-container,[data-rtl-skip]` — با `closest()` یعنی اجداد هم حساب‌اند.
- **بازیابی تمیز**: `dir` قبلی در `data-mimo-rtl-prev-dir` ذخیره و با حذف فارسی برمی‌گردد (مثلاً `dir=auto` بازسازی می‌شود، نه `ltr`).
- **زمان‌بندی (درس مهم!)**: اول با `requestAnimationFrame` بود — تست زنده با CDP نشان داد وقتی پنجره hidden/minimised است (یا حین رندر استریمینگ) rAF **اصلاً فایر نمی‌شود** و بلاک‌ها flip نمی‌شدند (`rescan()` دستی کار می‌کرد). از v1.1.0 sweep روی **تایمر سادهٔ ۶۰ms** است + تور ایمنی `scanAll` هر ۲.۵ ثانیه + هندلرهای `input`/`focusin` برای composer.
- قرارداد دیباگ: `window.__mimoRTL = { version, rescan }` و لاگ `[mimo-rtl] active vX.Y.Z` در کنسول.

## ۷. منطق استایل ‏(`rtl-fa.css`)‏

- `.mimo-rtl-fa { direction: rtl; unicode-bidi: isolate; text-align: right; font-family: Vazirmatn, ... }` — سه `@font-face` با مسیر نسبی `./assets/*.woff2`.
- `.mimo-rtl-input` مشابه ولی `unicode-bidi: embed` تا تایپ لاتین+فارسی مخلوط درست بچیند.
- داخل بلاک RTL، `pre/code/kbd/samp/tt/var/mjx-container/.katex...` اجباری `direction: ltr; font-family: monospace` می‌گیرند تا کدِ وسط متن فارسی آینه‌ای نشود.

## ۸. خط لولهٔ اسکریپت اجرایی (ترتیب مراحل)

1. گاردها (python3/ditto/فایل‌ها/سینتکس JS) → ۲) بستن کپی RTL در حال اجرا (اصلیِ در حال اجرا فقط هشدار) → ۳) `rm -rf` مقصد + `ditto` تازه + `xattr -cr` → ۴) extract/fix/inject/replace/add در asar → ۵) هش جدید + Info.plist → ۶) حذف app-update.yml → ۷) codesign ad-hoc (+fallback ساده) → ۸) `lsregister -f` → ۹) **راستی‌آزمایی کامل** (امضا، نام‌ها، تطابق هش plist با فایل، حضور ۴ ورودی + ارجاع index.html + حفظ unpacked) → خروج ۱ در صورت هر خطا.
- نکتهٔ `plutil`: کلید `Resources/app.asar` شامل `/` است و `-extract` آن را مسیر می‌فهمد — خواندن هش plist با پایتون انجام می‌شود.
- نکتهٔ `--extract`: فرم `ASAR_PATH=OUT_FILE` است (نه دو آرگومان جدا) چون argparse با positional تداخل داشت.

- **بدون Monaco** در باندل (۰ رخداد) — فقط composer و خروجی مارک‌داون مهم‌اند.



## ۹. راستی‌آزمایی (سه لایه — هر سه باید سبز باشند)

1. `npm test` — ۳۴ تست jsdom: پاراگراف مخلوط لاتین+فارسی، شروع با علائم/عدد/ایموجی، composer (تایپ/پاک/لاتین-اول)، استریمینگ توکن‌به‌توکن، بازیابی `dir=auto`، عدم flip کد/toolbar/pre/shiki/hljs/katex.
2. خروجی اسکریپت: باید با `everything verified` تمام شود (شامل تطابق `ElectronAsarIntegrity`).
3. تست زنده با CDP (قوی‌ترین مدرک): اپ را با `--remote-debugging-port=9333 --remote-allow-origins='*'` بالا بیاور، به `http://127.0.0.1:9333/json/list` وصل شو، با WebSocket روی `Runtime.evaluate` نود فارسی/انگلیسی/کد تزریق کن و `dir` محاسباتی + فونت را بخوان. نمونه اسکریپت‌ها در `.work/cdp-*.mjs` هستند (در gitignore؛ در صورت نیاز بازسازی کن).

نتایج ثبت‌شده v1.1.0: فارسی ⇒ `dir=rtl` + Vazirmatn؛ مخلوط با شروع لاتین ⇒ RTL؛ انگلیسی خالص ⇒ بدون `dir`، `ltr`، system-ui؛ `pre/shiki/hljs/div.hljs/katex` ⇒ بدون `dir`، `ltr`؛ سه فیس Vazirmatn با وضعیت `loaded`.

## ۱۰. تست دستی کاربر (بعد از هر بیلد)

1. کپی RTL را باز کن (بار اول right-click > Open). در composer تایپ کن: `Hello this is English ولی این جمله فارسی است` ← باید همان لحظه RTL + وزیرمتن شود.
2. ارسال کن: بابل کاربر و جواب مدل برای هر پاراگرافِ دارای فارسی RTL باشد، حتی با شروع لاتین.
3. پاراگراف خالص انگلیسی LTR بماند؛ بلاک کد LTR + monospace و غیرآینه‌ای.
4. کنسول DevTools باید `[mimo-rtl] active v1.1.0` نشان دهد؛ اسکن دستی: `window.__mimoRTL.rescan()`.

## ۱۱. عیب‌یابی (هر مورد واقعاً اتفاق افتاده)

| علامت | علت | راه‌حل |
|---|---|---|
| `Failed to get integrity for validatable asar` / اپ بالا نمی‌آید | هش plist با asar نمی‌خواند | اجرای مجدد اسکریپت؛ بررسی `ElectronAsarIntegrity` با پایتون |
| `ElectronAsarIntegrity mismatch: plist=?` در لاگ | خواندن با `plutil -extract` (کلید `/` دارد) | باگ شناخته‌شده و رفع‌شده: خواندن با plistlib پایتون |
| بلاک فارسی flip نمی‌شود ولی `rescan()` کار می‌کند | زمان‌بندی rAF در پنجرهٔ hidden فایر نمی‌شود | از v1.1.0 با تایمر ۶۰ms رفع شده؛ بررسی `document.visibilityState` |
| `missing local file: index.patched.html` | اجرای موازی دو دستور وابسته در یک batch | دستورات وابسته را ترتیبی اجرا کن |
| `pkill` پروسس اصلی را نمی‌کشد | در macOS خط فرمان فقط `Xiaomi MiMo AI` دیده می‌شود | `pkill -9 -f 'Xiaomi MiMo'` یا kill با PID |
| اجرای دوم با فلگ جدید، فلگ را نمی‌گیرد | single-instance به نمونهٔ قبلی forward می‌کند | اول همهٔ نمونه‌ها را بکش، بعد با فلگ بالا بیاور |
| تست jsdom ناپایدار/قرمز | settle کوتاه‌تر از sweep (۶۰ms) | ‏`settle ≥ 120ms`‏، بوت اولیه ‏`150ms`‏ |
| ابزار ویرایش «text not found» روی خطوط shell با `$`/escape | نرمال‌سازی escapeها توسط ابزار | ویرایش آن خط با اسکریپت پایتون (خواندن/جایگزینی سطری) |

## ۱۲. به‌روزرسانی‌های آینده (چک‌لیست ایجنت بعدی)

- [ ] بعد از آپدیت رسمی اپ اصلی: فقط `bash patch-xiaomi-mimo-rtl.sh` (کپی از صفر ساخته می‌شود).
- [ ] اگر DOM رندرر عوض شد (کلاس composer، ساختار کد shiki، ویرایشگر جدید): `SKIP_SELECTOR`/`BLOCK_QUERY`/`EDITABLE_SELECTOR` را به‌روز کن + تست jsdom اضافه کن + نسخه payload را بالا ببر.
- [ ] قانون نسخه: هر تغییر رفتاری در `rtl-fa.js` ⇒ `var VERSION` + هدر js/css + `package.json` + جدول بخش ۱۳ را هم‌زمان بالا ببر.
- [ ] بعد از هر تغییر: `npm test` → `bash patch-xiaomi-mimo-rtl.sh` → تست دستی بخش ۱۰ → همین GUIDE را به‌روز کن.

## ۱۳. گزارش تغییرات

| نسخه | تاریخ | چه شد |
|---|---|---|
| v1.0.0 | ۲۰۲۶-۰۹-۲۲ | انتشار اول: RTL + وزیرمتن برای بلاک دارای فارسی (حتی با شروع لاتین)؛ کد/ترمینال/ریاضی LTR؛ وصله‌گر append-only؛ خاموش‌کردن آپدیتر کپی؛ امضای ad-hoc. (زمان‌بندی rAF — بعداً معلوم شد در پنجرهٔ hidden کار نمی‌کند) |
| v1.1.0 | ۲۰۲۶-۰۹-۲۲ | رفع باگ زمان‌بندی: sweep با تایمر ۶۰ms به‌جای rAF (کشف با تست زندهٔ CDP در حالت hidden)؛ افزودن `.hljs/.shiki/.prismjs/.code-block/.codeblock` به SKIP_SELECTOR؛ نسخهٔ payload در `--status` و بنر پایانی؛ ۵ تست جدید skip؛ مجموع ۳۴ تست سبز؛ تست زندهٔ CDP کامل سبز |

## ۱۴. دستورهای مرجع (کپی‌پیست)

```bash
cd harnesses/xiaomi-mimo
npm test
bash patch-xiaomi-mimo-rtl.sh
bash patch-xiaomi-mimo-rtl.sh --status

# هش هدر asar (باید با ElectronAsarIntegrity داخل plist کپی RTL برابر باشد)
python3 patch_asar.py "/Applications/Xiaomi MiMo AI-RTL.app/Contents/Resources/app.asar" --hash

# استخراج یک ورودی از asar
python3 patch_asar.py "/Applications/Xiaomi MiMo AI-RTL.app/Contents/Resources/app.asar" \
  --extract "out/renderer/index.html=/tmp/idx.html"

# اعتبارسنجی کامل آرشیو (اسکریپت کمکی، در gitignore)
python3 .work/verify_asar.py "/Applications/Xiaomi MiMo AI-RTL.app/Contents/Resources/app.asar"

# اجرای اپ با پورت دیباگ برای تست زندهٔ CDP
"/Applications/Xiaomi MiMo AI-RTL.app/Contents/MacOS/Xiaomi MiMo AI" \
  --remote-debugging-port=9333 --remote-allow-origins='*'
# بعد: curl http://127.0.0.1:9333/json/list و اتصال WebSocket (نمونه: .work/cdp-*.mjs)
```
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

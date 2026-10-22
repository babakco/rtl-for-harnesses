# Qoder RTL Patch

پچ راست‌به‌چپ (RTL) برای نسخهٔ دسکتاپ **Qoder** روی macOS.

پچ هیچ فایلی از اپ اصلی را تغییر نمی‌دهد؛ هر بار یک کپی تازه از
`/Applications/Qoder.app` می‌سازد و روی آن کار می‌کند، پس ساخت نسخهٔ جدید **تکرارپذیر**
است و با هر آپدیت رسمی Qoder دوباره اجرا می‌شود.

| | |
|---|---|
| اپ رسمی (دست‌نخورده) | `/Applications/Qoder.app` |
| اپ RTL (خروجی پچ) | `/Applications/Qoder-RTL.app` |
| نسخهٔ پایهٔ فعلی | `0.4.2` |
| نسخهٔ پچ | `v3.2` |
| فونت | Vazirmatn (weights 400/500/700) |

## ساخت نسخهٔ RTL

```bash
bash harnesses/qoder/patch-qoder-rtl.sh
```

اسکریپت هر بار از صفر می‌سازد، پس اجرای دوباره بی‌خطر است. بعد از هر آپدیت
رسمی Qoder همین اسکریپت را دوباره اجرا کنید.

پیش‌نیازها: macOS، `python3`، `node` (برای بررسی نحوی)، `npx @electron/asar`،
`plutil`، `codesign`.

## قاعدهٔ RTL

هر عنصر متنی که **حتی یک حرف فارسی/عربی** داشته باشد (بازهٔ `U+0600–U+06FF`،
Arabic Supplement، Arabic Extended-A، Presentation Forms، ZWNJ/ZWJ)
راست‌چین می‌شود و فونت Vazirmatn می‌گیرد — حتی اگر جمله با انگلیسی شروع شده باشد.

عناصر بدون متن فارسی دست‌نخورده (چپ‌چین) می‌مانند.

### موارد تحت پوشش

| ناحیه | سلکتور / نشانه | رفتار |
|---|---|---|
| خروجی دستیار | `.markdown-body`، `[data-chat-message-text]`، `[data-message-kind="assistant"]`، `[data-message-id]` | `dir=rtl` + Vazirmatn روی `p/li/h1..h6/blockquote/td/th/dt/dd` |
| خروجی مجازی‌شده | `[data-markdown-virtual-block]`، `[data-markdown-virtualized]` | همان قاعده برای بلوک‌های استریم/اسکرول |
| حباب کاربر | `[data-user-message] [data-chat-message-text]` (کلاس `.qoder-rtl-user`) | فقط متن حباب RTL می‌شود؛ **جای حباب** (`justify-end`) عوض نمی‌شود |
| ورودی چت | `.loop-rich-editor`، `[contenteditable="true"]`، `textarea` (کلاس `.qoder-rtl-input`) | هنگام تایپ بلافاصله جهت عوض می‌شود |
| **فایل‌های workspace — تب Preview** | `[data-markdown-file-preview]` (کلاس `.qoder-rtl-file`) | کل نما RTL وقتی سند فارسی دارد؛ نقل‌قول لبهٔ راست؛ جدول/لیست آینه |
| **فایل‌های workspace — تب Source** | `[data-workspace-source-file-viewer]` (کلاس `.qoder-rtl-file`) | همان رفتار، فقط برای فایل‌های متنی/مستنداتی |
| پیش‌نمایش Artifact/خروجی فایل | همان دو کانتینر بالا | جدول‌های `.cm-markdown-embedded` هم RTL |

### مواردی که عمداً LTR می‌مانند

- ادیتور کد (`WorkspaceSourceFileViewer` در تب Source، `monaco-editor`, `.cm-content`).
- خطوط کد در پیش‌نمایش Markdown (کلاس‌های `cm-markdown-code*` شامل `code-start`، `code-end`، `code-fence`).
- `pre`/`code`/`kbd`/`samp` و ریاضی KaTeX (`.cm-markdown-math`).
- `inline code` و منشن‌ها (`[data-editor-inline-token]`) داخل متن RTL.
- ترمینال (`xterm`) و `canvas`.

## نکتهٔ کلیدی: چرا RTL روی «کانتینر» اعمال می‌شود، نه روی خطوط

در Qoder 0.4.2 فایل باز‌شده در workspace — چه در تب Source و چه در تب Preview —
داخل **CodeMirror** (`<div class="cm-content">`) رندر می‌شود. سه نتیجهٔ مهم دارد:

### ۱) CodeMirror هر تغییر خارجی در DOM خود را برمی‌گرداند

هر گره‌ای که خودمان داخل `.cm-content` دست بزنیم (کلاس، `dir`، attribute) توسط
`DOMObserver` داخلی CodeMirror به‌عنوان تغییر خارجی دیده می‌شود و در همان فریم
بازترسیم می‌شود. اندازه‌گیری عملی: بعد از اعمال کلاس روی خطوط، ظرف **۲۵۰ms** کلاس
همه از بین می‌رفت، در حالی که اسکن دستی درست قبل از اندازه‌گیری ۱۵ خط را علامت
زده بود. پس کلاس‌زدن روی تک‌خط‌ها **دوام ندارد** و نباید انجام شود.

### ۲) جهت از کانتینر پایدار ارث می‌رسد

کانتینر `[data-markdown-file-preview]` / `[data-workspace-source-file-viewer]` را
React می‌سازد، نه CodeMirror؛ پس `dir="rtl"` روی آن پایدار می‌ماند (آزمایش شد).
`.cm-content` هیچ `direction` صریحی ندارد، بنابراین جهت را ارث می‌برد و
`text-align: start` در RTL به‌طور خودکار «راست» می‌شود.

پس الگو این است:

- **JavaScript** فقط تصمیم می‌گیرد: آیا این سند فارسی است؟ اگر بله، روی کانتینر
  `dir="rtl"` + کلاس `.qoder-rtl-file` می‌گذارد.
- **CSS** همهٔ قوانین را روی `.qoder-rtl-file` تعریف می‌کند: فونت وزیرمتن،
  راست‌چینی خطوط، آینهٔ پدینگ، نقل‌قول با لبهٔ راست، و استثناهای LTR.

### ۳) تشخیص فارسی روی متن کامل سند، نه DOM مجازی‌شده

در حالت Preview، CodeMirror فقط پنجره‌ای از سند را در DOM نگه می‌دارد
(۵.۸KB متن در برابر ۴۱KB سند واقعی). برای تشخیص درست، متن کامل از خود
CodeMirror خوانده می‌شود:

```js
document.querySelector(".cm-content").cmTile.view.state.doc.toString()
```

### granularity: کل سند یک‌کله

چون نمی‌توان روی خطوط کلاس گذاشت، تصمیم RTL در سطح **کل سند** گرفته می‌شود. در
سندی که ترکیبی از فارسی و انگلیسی است، خطوط انگلیسی هم راست‌چین می‌شوند (محتوا
درست نمایش داده می‌شود، فقط تراز فرق دارد). برای گرفتن رفتار «خلطی» در چت
(پاراگراف‌به‌پاراگراف) ممکن است، چون متن چت در DOM واقعی رندر می‌شود.

### تشخیص فایل متنی در برابر فایل کد

مسیر فایل فعال از `title` روی `[data-workspace-file-breadcrumbs]` (یا
`[data-external-file-preview-path]`) خوانده می‌شود و پسوند آن بررسی می‌گردد:

| پسوند | رفتار |
|---|---|
| `md` `markdown` `mdx` `txt` `text` `log` `rst` `adoc` `asciidoc` `org` `csv` `tsv` `ini` `cfg` `conf` `env` | RTL در تب Source |
| بدون پسوند (`LICENSE`, `README`) | RTL در تب Source |
| بقیه (`py` `ts` `tsx` `js` `sql` `json` `yaml` …) | LTR — همیشه |
| نامشخص (هدر فایل رندر نشده) | LTR — محافظه‌کارانه |

تب Preview همیشه prose فرض می‌شود (فایل markdown رندرشده است).

## نکتهٔ زمان‌بندی: rAF در پنجرهٔ مخفی اجرا نمی‌شود

در Qoder/Electron وقتی پنجره در پس‌زمینه یا پوشیده است،
`document.visibilityState === "hidden"` و **`requestAnimationFrame` اصلاً اجرا
نمی‌شود** (اندازه‌گیری: `raf` در ۷ ثانیه = صفر، در حالی که `setInterval` عادی
کار می‌کرد). نسخه‌های قبلی فقط به rAF تکیه می‌کردند، پس در همان حالت چند ثانیه تا
چند دقیقه طول می‌کشید تا RTL اعمال شود.

از v3.1 زمان‌بند دو مسیری است: rAF **و** `setTimeout(run, 60)` هر دو ثبت
می‌شوند و هرکدام زودتر اجرا شود کار را انجام می‌دهد. حلقهٔ پشتیبان هم به‌جای
`setInterval`، خودش را دوباره زمان‌بندی می‌کند تا خطای احتمالی آن را از کار
نیندازد، و `visibilitychange` هنگام برگشت به حالت نمایان، اسکن را فوری اجرا
می‌کند.

## ساختار فایل‌های پچ

```
qoder-rtl-patch/
├── patch-qoder-rtl.sh     # نقطهٔ ورود: کپی، تزریق، امضا، راستی‌آزمایی
├── patch_asar.py          # تزریق جراحی داخل app.asar (unpackedها دست‌نخورده)
├── rtl-fa.js              # منطق تشخیص فارسی و اعمال dir/class (v3.2.0)
├── rtl-fa.css             # استایل Vazirmatn + قوانین RTL/آینه (v3.2)
└── vazirmatn-*.woff2      # فونت Vazirmatn (regular/medium/bold)
```

### روش کار اسکریپت

1. خواندن نسخه از `CFBundleShortVersionString`.
2. حذف نسخهٔ قبلی `Qoder-RTL.app` و کپی تازه از `Qoder.app`.
3. تزریق `<link rtl-fa.css>` + `<script rtl-fa.js>` در
   `out/renderer/index.html` با تطبیق regex روی `index-*.css` (بدون هاردکدِ هش
   دارایی‌ها، تا با تغییر نسخهٔ Qoder نشکند) — تزریق idempotent است.
4. خاموش کردن «بررسی خودکار بروزرسانی» در `out/main/index.js` با تطبیق دقیق یک
   anchor (`l.set(P_e,new We(Yde,[{enabled:c}]))`). اگر anchor یکتا نباشد، اسکریپت
   با خطا متوقف می‌شود تا `main.js` خراب نشود. دکمهٔ **بررسی دستی** در تنظیمات
   دست‌نخورده می‌ماند، بنابراین `app-update.yml` حذف نمی‌شود.
5. تزریق ۷ فایل داخل `app.asar` با بازسازی هدر و به‌روزرسانی `integrity` هر فایل.
6. تغییر `CFBundleIdentifier` به `com.qoder.app.rtl`، `CFBundleDisplayName` به
   `Qoder-RTL`، و اسکیم‌های URL به `qoder-rtl` / `qoder-rtl-app`.
7. به‌روزرسانی هش `ElectronAsarIntegrity` (SHA256 بایت‌های خام JSON هدر).
8. امضای ad-hoc و `xattr -cr`.
9. راستی‌آزمایی: `codesign -v`، بررسی هش همهٔ ۴۵۸۰ فایل packed، و تأیید وجود
   پچ در خروجی نهایی.

### نکته‌های حساس macOS

- `CFBundleName` باید `"Qoder"` بماند. الکترون Helperها را با همین نام پیدا
  می‌کند (`Frameworks/Qoder Helper*.app`) و تغییرش باعث خطای
  `Unable to find helper app` می‌شود.
- حذف `ElectronAsarIntegrity` باعث کرش با پیام
  `Failed to get integrity for validatable asar` می‌شود؛ باید به‌روز شود.
- امضا ad-hoc است، پس `spctl` ممکن است آن را رد کند؛ در اولین اجرا اگر لازم شد
  با راست‌کلیک ← Open باز کنید.

## تست پس از ساخت

1. **دستیار** — در چت بنویسید:
   ```
   Hello this is English ولی این جمله فارسی است
   ```
   پاراگراف باید راست‌چین + وزیرمتن شود؛ پاراگراف کاملاً انگلیسی چپ‌چین بماند؛
   بلوک کد چپ‌چین بماند.
2. **فایل workspace** — یک فایل متنی فارسی (`md` یا `txt`) را در پنل راست باز کنید:
   - تب **Source** (پیش‌فرض برنامه): کل سند راست‌چین + وزیرمتن.
   - تب **Preview**: متن راست‌چین، نقل‌قول با لبهٔ راست، جدول/لیست آینه،
     بلوک کد چپ‌چین.
   - یک فایل کدی (`py`/`ts`/`sql`) باز کنید: باید چپ‌چین بماند.
3. **حباب کاربر** — پیام فارسی بفرستید؛ متن حباب راست‌چین، جای حباب ثابت.
4. **کامپوزر** — در باکس ورودی فارسی بنویسید؛ ورودی راست‌چین، منشن `@file` چپ‌چین.
5. **کنسول** — باید `[qoder-rtl] active v3.2.0` را چاپ کند.
   برای اجرای دستی اسکن: `window.__qoderRTL.rescan()`.

## تاریخچهٔ نسخه‌ها

- **v1.0** — نسخهٔ اولیه: فقط `.markdown-body` و `#root`، انکر هاردکد هش CSS.
- **v2.0** — بازسازی برای Qoder 0.4.2: سلکتورهای واقعی چت
  (`data-chat-message-text` / `data-message-kind` / virtualization)، حباب کاربر،
  کامپوزر `.loop-rich-editor`، و تزریق داینامیک index.html.
- **v2.1** — خاموش کردن بررسی خودکار آپدیت در `out/main/index.js` با anchor یکتا،
  حفظ `app-update.yml` برای کار کردن بررسی دستی، و راستی‌آزمایی هش asar.
- **v3.0** — افزودن پشتیبانی پیش‌نمایش Markdown در workspace روی **خطوط**
  (`.cm-line` کلاس `.qoder-rtl-mdline`). این روش کار نکرد: CodeMirror تغییرات
  خارجی در `.cm-content` را برمی‌گرداند و حالت پیش‌فرض فایل‌ها اصلاً تب Source
  است، نه Preview.
- **v3.1** — افزودن تب Source + زمان‌بند مقاوم (رفع تکیه بر rAF که در پنجرهٔ
  مخفی اجرا نمی‌شود). هنوز روی خطوط، پس همان مشکل بازگشت DOM باقی بود.
- **v3.2** — راه‌حل نهایی: حذف کلاس‌زدن به خطوط، و اعمال `dir=rtl` روی **کانتینر
  پایدار** با کلاس `.qoder-rtl-file` + قوانین کامل CSS. تشخیص فارسی از متن کامل
  سند (`cmTile.view.state.doc`) به‌جای DOM مجازی‌شده، و تشخیص فایل متنی در برابر
  فایل کد از مسیر فایل در هدر. راستی‌آزمایی‌شده در Preview و Source با CDP.

## راستی‌آزمایی با CDP

برای بررسی بدون حدس، اپ با پورت دیباگ بالا اجرا و DOM زنده خوانده می‌شود:

```bash
open -na /Applications/Qoder-RTL.app --args --remote-debugging-port=9333
curl -s http://127.0.0.1:9333/json/list        # فهرست target ها
# سپس با WebSocket روی همان target، Runtime.evaluate بفرستید
```

معیارهای قبولی که این بار بررسی شدند:

| بررسی | نتیجه |
|---|---|
| نسخهٔ اسکریپت | `window.__qoderRTL.version === "3.2.0"` |
| تب Preview روی سند فارسی | `.qoder-rtl-file` + `dir=rtl` + خطوط `direction: rtl`, `text-align: right`, فونت Vazirmatn |
| پایداری در زمان | ۹ ثانیه نمونه‌برداری: بدون افت |
| تب Source (پیش‌فرض برنامه) | همان رفتار، ۷۹ خط |
| پاک‌کردن دستی کلاس و بازگشت خودکار | حلقهٔ پشتیبان زنده است |
| `rAF` در پنجرهٔ پوشیده | اجرا نمی‌شود ⇒ مسیر `setTimeout` لازم بود |
| منطق gate پسوند | `py/tsx/sql → false`، `md/txt/LICENSE → true` |
| بقای attribute روی کانتینر پایدار | تأیید شد (برخلاف `.cm-content`) |

## محدودیت‌ها

- **RTL در سطح کل سند است، نه خط‌به‌خط**، در نمای workspace. دلیل: CodeMirror
  تغییرات خارجی DOM را برمی‌گرداند. در نتیجه در سندِ ترکیبی، خطوط انگلیسی هم
  راست‌چین می‌شوند. برای رفتار خط‌به‌خط باید decoration از داخل خود CodeMirror
  اضافه شود (نیازمند patch در bundle).
- در **چت** تفکیک پاراگرافی کامل کار می‌کند، چون متن چت در DOM واقعی رندر
  می‌شود و CodeMirror در آن دخالتی ندارد.
- تشخیص فارسی در فایل‌ها از متن کامل سند خوانده می‌شود؛ برای اسناد خیلی بزرگ
  فقط ۴۰۰ هزار کاراکتر اول بررسی می‌شود.
- تشخیص فایل متنی/کدی به هدر فایل (`data-workspace-file-breadcrumbs`) وابسته است؛
  اگر رندر نشود، فایل محافظه‌کارانه LTR در نظر گرفته می‌شود.
- سقف پردازش: ۲۵۰۰ بلوک در هر اسکن، برای جلوگیری از افت فریم در گفتگوهای طولانی.
- ریاضی (KaTeX)، کد، ادیتور فایل‌های کد، ترمینال و متن‌های انگلیسی LTR می‌مانند
  (عمداً).
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

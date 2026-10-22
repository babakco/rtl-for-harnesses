# معماری پچ Kimi RTL

> مخاطب: کسی که می‌خواهد بعداً پچ را نگه‌داری/بازسازی کند.

## ۱) نمای کلی

```
Kimi.app  (دست‌نخورده)
   │  cp -R
   ▼
Kimi RTL.app
   ├─ Contents/Resources/app.asar        ← جراحی: تزریق kimi-rtl/ + یک import در main
   ├─ Contents/Info.plist                ← هش جدید asar + CFBundleName
   ├─ Contents/Frameworks/*Helper*.app   ← تغییر نام پوشه + فایل اجرایی + plist
   └─ Contents/Resources/app-update.yml  ← تغییر نام (غیرفعال‌سازی updater)
   │  codesign --force --deep --sign -
   ▼
باندل آمادهٔ اجرا
```

## ۲) چرا «جراحی asar» و نه extract/pack؟

دو مانع جدی وجود دارد که راه‌حل‌های معمول را بی‌اثر می‌کند:

1. **ElectronAsarIntegrity اجباری است.** Kimi با fuse
   `EmbeddedAsarIntegrityValidation` ساخته شده و `Info.plist` یک هش SHA256 برای
   `Resources/app.asar` دارد. در این حالت Electron:
   - هش **هدر asar** را چک می‌کند (`asar_util.cc: ValidateIntegrityOrDie("<header>")`)
   - و **برای هر فایل** داخل آرشیو یک بلوک `integrity`
     (`algorithm/hash/blockSize/blocks`) طلب می‌کند؛ اگر نباشد:
     `FATAL: Failed to read integrity for file in ASAR archive`.
   ابزار `@electron/asar` چنین بلوکی تولید نمی‌کند ⇒ هر repack ساده اپ را از کار می‌اندازد.

2. **۹ فایل با پرچم `unpacked`** در `app.asar.unpacked` نگه داشته می‌شوند
   (۷ فایل `.node` و دو worker که به‌صورت process جدا اجرا می‌شوند). repack ساده این
   پرچم‌ها را از بین می‌برد.

**راه‌حل پیاده‌شده:** ناحیهٔ دادهٔ asar اصلی **بایت‌به‌بایت** دست‌نخورده می‌ماند.
فقط هدر بازنویسی می‌شود و:

- رکورد `out/main/index.js` به محتوای جدید (یک خط `import` در ابتدا) اشاره می‌کند؛
- چند فایل جدید زیر `kimi-rtl/` اضافه می‌شود؛
- محتوای جدید در **انتهای ناحیهٔ داده** نوشته می‌شود؛
- چون `offset` در هدر **نسبت به شروع ناحیهٔ داده** ذخیره می‌شود، تمام فایل‌های
  دست‌نخورده سرجای خود می‌مانند و integrity آن‌ها معتبر باقی می‌ماند.

برای فایل‌های جدید، `hash` و `blocks` (چانک‌های ۴MiB) دقیقاً مثل Electron محاسبه و
در هدر نوشته می‌شود.

## ۳) مسیر اجرای کد در زمان اجرا

```
main process
└─ out/main/index.js   (ESM)
   └─ line 1:  import "../../kimi-rtl/rtl-main-bootstrap.mjs";
      └─ app.on("session-created")  → session.registerPreloadScript(rtl-preload.cjs)
      └─ app.on("ready")            → همان ثبت روی session.defaultSession
      └─ app.on("web-contents-created")
            └─ dom-ready → اگر نشانهٔ پچ نبود: insertCSS + executeJavaScript
```

```
renderer (هر پنجره/فریم)
├─ preloadهای خود Kimi (out/preload/*.mjs|cjs)
│     └─ خط اول تزریق‌شده:  import("…/rtl-preload.mjs")  یا  require("…/rtl-preload.cjs")
└─ rtl-preload.[cjs|mjs]
      ├─ webFrame.insertCSS(CSS, { cssOrigin: "user" })   ← عبور از CSP
      └─ rtl-autodir.js  (inline)                          ← جهت‌دهی زنده
```

سه لایهٔ تزریق عمداً هم‌پوشان‌اند (defense in depth):

| لایه | چه زمانی کار می‌کند | نتیجهٔ مشاهده‌شده |
| --- | --- | --- |
| `registerPreloadScript` | همهٔ WebContentsهای آن session | ✅ (`data-kimi-rtl-src="cjs"`) |
| تزریق در preloadهای خود اپ | تضمینی — چون خود Kimi از آن‌ها استفاده می‌کند | ✅ (`data-kimi-rtl-src="mjs"`) |
| `dom-ready` fallback | اگر هر دو بالا شکست بخورند | ✅ (فعال، در حالت سالم skip می‌شود) |

نشانهٔ اجرا: اتریبیوت `data-kimi-rtl` روی `<html>`؛ مقدار `data-kimi-rtl-src`
نشان می‌دهد کدام مسیر(ها) اجرا شده‌اند (مثلاً `cjs+mjs`).

## ۴) منطق جهت‌دهی (`patches/rtl-autodir.js`)

1. **انتخاب بلوک‌های متنی:** تگ‌های قطعی (`p, li, h1..h6, blockquote, td, th, dd, dt,
   figcaption, caption, summary, label`) و کانتینرهای عمومی (`div, span, a, button`)
   فقط اگر «متن مستقیم» داشته باشند.
2. **جمع‌آوری متن:** متن عنصر بدون احتساب زیردرخت‌های مستثنا (کد، فرمول، نمودار، SVG).
3. **تصمیم جهت:**
   ```
   اگر متن شامل حرف فارسی/عربی باشد        → dir = rtl
   وگرنه اگر شامل حرف لاتین باشد          → dir = ltr
   وگرنه (فقط عدد/علائم/خالی)              → دست‌نخورده
   ```
   این همان قاعدهٔ درخواستی است: «شروع با انگلیسی/علائم مهم نیست؛ وجود یک حرف
   فارسی کافی است که کل بلوک RTL شود.»
4. **پشتیبانی زنده:**
   - `MutationObserver` روی کل سند (childList + characterData) با batch ۱۶ms
     (عمداً `setTimeout` و نه `requestAnimationFrame`؛ چون rAF در پنجرهٔ
     غیرفعال/مخفف اجرا نمی‌شود و جهت‌دهی عقب می‌افتد).
   - رویدادهای `input`/`focusin`/`paste` برای **کامپوزر** (contenteditable،
     textarea، input متنی): جهت با هر تایپ به‌روز می‌شود؛ متن خالی دست‌نخورده
     می‌ماند تا placeholder جهت خودش را نگه دارد.
5. **استثناها:** `pre, code, kbd, samp, var, tt, .monaco-editor, .cm-editor,
   .katex, .MathJax, [class*=mermaid], [class*=code-block], svg, canvas, …`.

## ۵) استایل (`patches/rtl.css`)

- سه `@font-face` برای Vazirmatn (مسیر `./assets/*.woff2` که در build به data-URI
  تبدیل می‌شود).
- اعمال فونت روی کل رابط با `!important` (مبدأ user در `insertCSS`، پس بر
  `!important`های خود سایت غلبه می‌کند) و override مونو‌اسپیس برای کد/ویرایشگر.
- `.kimi-rtl-auto[dir="rtl"]` → `direction: rtl !important; unicode-bidi: isolate;
  text-align: start !important`.
- اصلاح‌های هندسی برای فهرست، نقل‌قول و جدول در حالت RTL.

## ۶) فایل‌های تولیدشده

`build-preload.cjs.js` سه فایل می‌سازد:

| فایل | مصرف‌کننده |
| --- | --- |
| `rtl-preload.cjs` | session preload + preloadهای `.cjs` |
| `rtl-preload.mjs` | preloadهای `.mjs` خود Kimi (import دینامیک) |
| `rtl-inline.css` | `webContents.insertCSS` در لایهٔ اطمینان |

هر دو preload، اسکریپت `rtl-autodir.js` را **inline** و بدون `eval` در خود دارند
(تا محدودیت CSP روی `eval` مسئله نباشد).
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

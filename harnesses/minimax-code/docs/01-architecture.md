# ۱) معماری MiniMax Code و معماری پچ

> مخاطب: کسی که می‌خواهد بعداً پچ را نگه‌داری یا بازسازی کند.

---

## ۱) نمای کلی پچ

```
/Applications/MiniMax Code.app          (دست‌نخورده)
   │  cp -R
   ▼
/Applications/MiniMax Code-RTL.app
   ├─ Contents/Resources/app.asar        ← جراحی: قلاب preload + تزریق HTML + دارایی‌های RTL
   ├─ Contents/Info.plist                ← هش جدید asar + CFBundleDisplayName
   ├─ Contents/Resources/app-update.yml  ← تغییر نام (غیرفعال‌سازی updater)
   │  codesign --force --deep --sign -
   ▼
باندل آمادهٔ اجرا
```

---

## ۲) معماری خود MiniMax Code (نسخهٔ ۳.۱.۴)

MiniMax Code یک اپ **Electron 42.8.0** (Chromium 148) با این ساختار است:

```
MiniMax Code.app/Contents/
├── MacOS/MiniMax Code              ← شیم اجرایی (۵۳KB) → Electron Framework
├── Info.plist                      ← XML + ElectronAsarIntegrity (فقط hash، بدون blocks)
├── Frameworks/
│   ├── Electron Framework.framework ← بینس ۱۸۹MB (fuseها اینجاست)
│   ├── MiniMax Code Helper.app      (+ GPU / Plugin / Renderer)
│   └── …
└── Resources/
    ├── app.asar                    ← ۴۱۵MB، ۳۱٬۹۹۹ فایل، ۴۳۶ فایل unpacked
    ├── app.asar.unpacked/          ← فقط باینری‌های native (node-pty، better-sqlite3، …)
    └── app-update.yml              ← تنظیمات electron-updater
```

### لایهٔ main process (CommonJS، داخل asar)

```
dist/main/
├── index.js            ← نقطهٔ ورود: app.setName، userData، single-instance lock
├── preload.js          ← preload اصلی (پنجرهٔ گفت‌وگو، ورود، onboarding، لاگ‌ویوور، mini-chat)
├── model-menu-preload.js  ← preload پاپ‌آپ انتخاب مدل
├── config/{constants,routes,app-identity}.js
├── ipc/*.js            ← ~۴۰ کانال IPC
├── modules/
│   ├── protocol/       ← پروتکل app:// که رندرر را سرو می‌کند
│   ├── hotUpdate/      ← به‌روزرسانی داغِ رندرر
│   ├── document-preview/ ← پروتکل artifact برای نمایش فایل‌ها (PDF/Office) با CSP سخت‌گیرانه
│   └── …
└── windows/            ← ساخت پنجره‌ها (archonChatWindow = پنجرهٔ اصلی)
```

### لایهٔ renderer

Next.js static export در `out/` که با پروتکل **`app://./`** سرو می‌شود
(`dist/main/modules/protocol/index.js` → `resolveFilePath([rendererRoot], urlPath)`):

```
out/
├── index.html, 404.html
├── archon/index.html            ← پنجرهٔ اصلی گفت‌وگو
├── archon-mini-chat/index.html
├── login/, onboarding/, log-viewer/, docx/
├── pdf/web/viewer.html          ← نمایشگر PDF.js (از ریشهٔ pdf سرو می‌شود)
├── _next/static/{chunks,css}/   ← ۳۷ فایل CSS + ~۵۰۰ چانک JS
├── fonts/jetbrains-mono/
└── minimax-rtl/                 ← ◄── دارایی‌های ما (تزریق‌شده)
```

نقاط مهم رندرر:

| مورد | محل |
| --- | --- |
| متغیر فونت رابط | `--mcode-font-family-ui` |
| متغیر فونت کد | `--mcode-font-family-code` |
| نمایشگر کد در گفت‌وگو | `.code-view` / `.code-view-line-body` |
| نمایشگر فایل (کد/متن/Office) | `.ofv-code-body` / `.ofv-text-block` / `.ofv-markdown-body` |
| پاپ‌آپ انتخاب مدل | `dist/model-menu/` (اپ جداگانهٔ Vite، لود با `loadFile` ⇒ origin = `file://`) |

### مکانیزم single-instance

`app.requestSingleInstanceLock()` قفل را در **مسیر userData** نگه می‌دارد
(کلید محتوایی فقط پیام `second-instance` را عوض می‌کند). چون هر دو نسخه
نام `app.setName("MiniMax Agent")` دارند، بدون مداخله **هم‌زمان اجرا می‌شدند و
یکی دیگری را می‌بست**. به همین دلیل پچ userData را جدا می‌کند.

### مکانیزم hot-update

`dist/main/modules/hotUpdate/` می‌تواند ریشهٔ رندرر را از `out/` به یک پوشهٔ
دانلودشدهٔ دیگر منتقل کند (`getHotUpdateBootRenderer().root`). اگر این اتفاق
بیفتد، فایل‌های پچ‌شدهٔ `out/` از کار می‌افتند ⇒ پچ آن را غیرفعال می‌کند.

---

## ۳) چرا «جراحی asar» و نه extract/pack؟

سه مانع جدی:

1. **integrity هر فایل.** هر ۳۱٬۹۹۹ فایل داخل asar یک رکورد
   `integrity: {algorithm, hash, blockSize: 4194304, blocks[]}` دارد.
   ابزار `@electron/asar` چنین بلوکی تولید نمی‌کند ⇒ repack ساده اپ را از کار
   می‌اندازد.
2. **۴۳۶ فایل `unpacked`** در `app.asar.unpacked` (باینری‌های native و
   workerهای جدا). repack ساده این پرچم‌ها را از بین می‌برد.
3. **حجم.** ۴۰۰MB دادهٔ باینری که باید دست‌نخورده بماند.

**راه‌حل پیاده‌شده:** ناحیهٔ دادهٔ asar اصلی **بایت‌به‌بایت** حفظ می‌شود.
فقط هدر بازنویسی می‌شود و:

- رکورد چند فایل موجود به محتوای جدید (با offset جدید در انتهای ناحیهٔ داده)
  اشاره می‌کند؛
- چند فایل جدید اضافه می‌شوند؛
- چون `offset` در هدر **نسبت به شروع ناحیهٔ داده** ذخیره می‌شود، تمام فایل‌های
  دست‌نخورده سرجای خود می‌مانند و integrity آن‌ها معتبر می‌ماند.

برای فایل‌های جدید و تغییریافته، `hash` و `blocks` (چانک‌های ۴MiB) دقیقاً
مثل Electron محاسبه و در هدر نوشته می‌شود.

> نکته: fuse `EnableEmbeddedAsarIntegrityValidation` در این اپ **DISABLED**
> است، پس Electron حتی per-file integrity را چک نمی‌کند؛ با این حال پچ
> همه‌چیز را مطابق انتظار Electron می‌نویسد تا باندل در هر حالت معتبر بماند.

---

## ۴) لایه‌های تزریق RTL

پچ عمداً **دو مسیر مستقل** برای هر رندرر دارد تا اگر یکی از کار افتاد، دیگری
کار کند:

```
┌─ مسیر ۱: قلاب preload (همیشه فعال) ────────────────────────────┐
│  dist/main/preload.js         → تزریق CSS + اجرای اسکریپت جهت    │
│  dist/main/model-menu-preload.js → همان برای پاپ‌آپ مدل           │
│  · CSP صفحه را دور می‌زند (webFrame.insertCSS)                    │
│  · CSS به‌صورت inline (data-URI) تزریق می‌شود ⇒ مستقل از مسیر فایل │
└───────────────────────────────────────────────────────────────────┘
┌─ مسیر ۲: تزریق در HTML (پشتیبان) ───────────────────────────────┐
│  out/**/*.html                 → <link> + <script src>            │
│  dist/model-menu/index.html    → همان با مسیر نسبی ./minimax-rtl │
│  · دارایی‌ها از همان origin سرو می‌شوند ⇒ font-src 'self' کافی است │
└───────────────────────────────────────────────────────────────────┘
```

جلوگیری از اجرای دوباره: هر دو مسیر یک **نشانهٔ DOM مشترک**
(`data-minimax-rtl="1"` روی `<html>`) دارند؛ DOM بین world ایزولهٔ preload و
main world مشترک است، پس دقیقاً یکی از آن‌ها کار می‌کند.

---

## ۵) قاعدهٔ جهت‌دهی

```
dirOf(text):
   t = text − کاراکترهای کنترلی دوجهته (LRM/RLM/…/LRI…PDI)
   اگر t شامل حرف فارسی/عربی/عبری ⇒ "rtl"      ← حتی اگر با انگلیسی/عدد/علامت شروع شده باشد
   اگر t شامل حرف لاتین ⇒ "ltr"
   در غیر این صورت ⇒ null (دست‌نخورده)
```

دامنهٔ ranges راست‌به‌چپ:
`U+0590–05FF` (عبری) · `U+0600–06FF` (عربی/فارسی) · `U+0750–077F` ·
`U+08A0–08FF` · `U+FB1D–FDFF` · `U+FE70–FEFF`

سطوحی که جهت‌دهی در آن‌ها اعمال می‌شود:

| سطح | نمونه |
| --- | --- |
| بلوک‌های متنی | `p` `li` `h1..h6` `blockquote` `td` `th` `dd` `dt` `figcaption` `caption` `summary` `label` |
| کانتینرهای عمومی | `div` `span` `a` `button` `em` `strong` `b` `i` `small` (فقط اگر متنِ مستقیم داشته باشند) |
| خط‌های کد | `.code-view-line-body` (جهت هر **خط** جداگانه) |
| خطوط فایل متنی | `.ofv-text-block` (بلوک به خطوط `<span>` شکسته می‌شود) |
| کامپوزر | `input` / `textarea` / `contenteditable` (بر اساس متن تایپ‌شده) |

استثناها: `pre`، کانتینرهای کد، KaTeX، mermaid، ترمینال (xterm)، svg/canvas،
و هر عنصری با کلاس `.minimax-rtl-skip`.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

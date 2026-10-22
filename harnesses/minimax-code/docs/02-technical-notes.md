# ۲) جزئیات فنی

---

## ۱) قالب باینری asar و محاسبهٔ هش

```
[0,4)    uint32  payload size پیکل بیرونی (همیشه ۴)
[4,8)    uint32  اندازهٔ ناحیهٔ هدر = 4 + payloadSize
[8,12)   uint32  payloadSize (شروع پیکل هدر)
[12,16)  uint32  طول رشتهٔ JSON هدر
[16,…)   رشتهٔ JSON + padding تا مضرب ۴
         دادهٔ فایل‌ها از offset = 8 + اندازهٔ ناحیهٔ هدر شروع می‌شود
```

مرجع: `shell/common/asar/archive.cc` (Electron) →
`PickleIterator(...).ReadString(&header)` ⇒ فقط بایت‌های JSON هش می‌شوند
(بدون ۴ بایت طول و بدون padding).

بنابراین هش `ElectronAsarIntegrity.hash` در `Info.plist` برابر است با:

```js
sha256(Buffer.from(JSON.stringify(header), "utf8"))
```

و `blockSize` واقعی از روی رکورد `integrity` یکی از فایل‌های موجود **کشف**
می‌شود (در این اپ `4194304` = ۴MiB) — hardcode نمی‌شود.

---

## ۲) fuseهای Electron (Electron 42.8.0)

خوانده‌شده از `Electron Framework.framework/Versions/A/Electron Framework`
(سنسور fuse با رشتهٔ `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`):

| Fuse | وضعیت | اثر روی پچ |
| --- | --- | --- |
| `RunAsNode` | ENABLED | — |
| `EnableCookieEncryption` | DISABLED | — |
| `EnableNodeOptionsEnvironmentVariable` | DISABLED | — |
| `EnableNodeCliInspectArguments` | DISABLED | — |
| `EnableEmbeddedAsarIntegrityValidation` | **DISABLED** | Electron per-file integrity را چک نمی‌کند؛ با این حال پچ آن را درست می‌نویسد |
| `OnlyLoadAppFromAsar` | DISABLED | — |
| `LoadBrowserProcessSpecificV8Snapshot` | DISABLED | — |
| `GrantFileProtocolExtraPrivileges` | DISABLED | — |

---

## ۳) CSP و منابع فایل

| Origin | CSP | راه‌حل فونت |
| --- | --- | --- |
| `app://./` (رندرر اصلی) | **بدون CSP** | فونت data-URI یا فایل same-origin — هر دو کار می‌کنند |
| `app://` artifact protocol (نمایشگر PDF/Office) | `default-src 'self'; font-src 'self'; …` | فایل فونت same-origin در `out/pdf/minimax-rtl/fonts/` ⇒ با `font-src 'self'` سازگار |
| `file://` پاپ‌آپ مدل | `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'` | فونت **inline** (data-URI) + افزودن `data:` به `font-src` |

قاعدهٔ کلی: **مسیر نسبی `./fonts/…` را داخل `rtl.css` نگه می‌داریم** تا در هر
originی که فایل CSS از همان origin سرو می‌شود درست کار کند، و در کنارش یک
**نسخهٔ inline با data-URI** برای preload و پاپ‌آپ `file://` داریم.

تزریق CSS از preload با `webFrame.insertCSS(css, {cssOrigin: "user"})`:
از CSP صفحه عبور می‌کند و چون origin=user است، بر استایل author خود اپ
**قوی‌تر** است. به همین دلیل قواعد حیاتی در `rtl.css` با `!important`
نوشته شده‌اند.

---

## ۴) نکتهٔ ظریف: `direction` و `dir="ltr"`

اشتباه اولیه در `rtl.css`:

```css
/* ❌ اشتباه */
.minimax-rtl-auto { direction: rtl !important; }
```

`rtl-autodir.js` برای بلوک‌های **انگلیسی** هم `dir="ltr"` ست می‌کند، ولی
`direction: rtl !important` بر استایل UA (`[dir="ltr"] { direction: ltr }`)
غلبه می‌کرد ⇒ پاراگراف‌های انگلیسی هم **راست‌چین** می‌شدند.

راه‌حل: دو کلاس مجزا.

| کلاس | معنی | قواعد CSS |
| --- | --- | --- |
| `.minimax-rtl-auto` | «این عنصر بررسی شده» | فقط `unicode-bidi: isolate` |
| `.minimax-rtl-rtl` | «این عنصر واقعاً فارسی است» | `direction: rtl !important` + `text-align: right !important` |

اسکریپت برای فارسی هر دو کلاس را می‌گذارد و برای انگلیسی فقط `.minimax-rtl-auto`
را نگه می‌دارد و `.minimax-rtl-rtl` را حذف می‌کند.

---

## ۵) کشیدن فونت Vazirmatn در چند ریشه

`rtl.css` با `url("./fonts/Vazirmatn-*.woff2")` به فایل‌های کنار خودش اشاره
می‌کند. چون یک فایل CSS می‌تواند در چند origin سرو شود، نسخهٔ CSS و پوشهٔ
`fonts/` در هر ریشه کپی می‌شود:

| ریشه | مسیر فایل در asar | سروشده از |
| --- | --- | --- |
| رندرر اصلی | `out/minimax-rtl/` | `app://./minimax-rtl/…` |
| نمایشگر PDF | `out/pdf/minimax-rtl/` | `app://./minimax-rtl/…` (از ریشهٔ pdf) |
| پاپ‌آپ مدل | `dist/model-menu/minimax-rtl/` | `file://…/minimax-rtl/…` |

---

## ۶) قلاب preload

`dist/main/preload.js` با چند خط اولِ اضافه‌شده شروع می‌شود. این preload در
Electron 42 **sandboxed** است (`sandbox` پیش‌فرض true وقتی `nodeIntegration`
غیرفعال باشد)، پس:

- `require('electron').webFrame` در دسترس است ✔ (و `insertCSS` کار می‌کند)
- `require('fs')` در دسترس **نیست** ⇒ لاگ اشکال‌زدایی داخل `try/catch` است
- `process.env` در دسترس است ✔

محتوای قلاب:

1. نشانهٔ `data-minimax-rtl-preload="1"` روی `<html>`.
2. در `DOMContentLoaded`: اگر صفحه خودش `[data-minimax-rtl-asset]` دارد، CSS
   تزریق نمی‌شود (صفحه خودش فایل CSS را دارد)؛ در غیر این صورت CSS تزریق
   می‌شود.
3. منطق جهت‌دهی به‌صورت **inline** اجرا می‌شود (بدون `eval`).

---

## ۷) جدا کردن userData

در `dist/main/index.js` بلافاصله بعد از `app.setName(APP_NAME)`:

```js
try {
    const __mmRtlPath = require('node:path');
    electron_1.app.setPath('userData', __mmRtlPath.join(
        electron_1.app.getPath('appData'),
        "MiniMax Code-RTL"));
    /* MINIMAX_RTL_USERDATA */
}
catch (e) { /* noop */ }
```

نتیجه:

- `~/Library/Application Support/MiniMax Code-RTL/` ← دادهٔ نسخهٔ RTL
- قفل تک‌نمونه‌ای جدا ⇒ هر دو نسخه هم‌زمان اجرا می‌شوند
- **نام app عوض نمی‌شود** (`app.setName("MiniMax Agent")`) ⇒ کلید
  Keychain مربوط به `safeStorage` (و در نتیجه کوکی‌های نشست) یکی می‌ماند و
  با کپی‌کردن userData، **ورود کاربر حفظ می‌شود**

پچر در اجرای اول، userData نسخهٔ اصلی را در پوشهٔ جدید کپی می‌کند (به‌جز
فایل‌های قفل `Singleton*`).

---

## ۸) نام اپ و helper appها

`CFBundleName` **دست‌نخورده** می‌ماند و فقط `CFBundleDisplayName` به
`MiniMax Code-RTL` تغییر می‌کند.

دلیل: Electron نام helper appها را از روی نام باندل پیدا می‌کند
(`Frameworks/<name> Helper<suffix>.app`). اگر `CFBundleName` عوض شود ولی
پوشه‌های helper rename نشوند، اپ ممکن است بالا نیاید. در مقابل
`CFBundleDisplayName` روی macOS بر `CFBundleName` مقدم است و همان چیزی است
که کاربر در Dock و Finder می‌بیند.

(پروژهٔ خواهر `Kimi-RTL` از الگوی rename استفاده می‌کند؛ آن الگو هم در
Electron 43 کار می‌کند ولی ریسک بیشتری دارد. در این پچ، اگر خواستید حالت
rename را امتحان کنید، فلگ `--set-bundle-name` وجود دارد — ولی توجه کنید که
در آن حالت باید helper appها هم rename شوند.)

---

## ۹) غیرفعال‌سازی به‌روزرسانی

| مکانیزم | روش غیرفعال‌سازی |
| --- | --- |
| `electron-updater` (آپدیت کل اپ) | rename `Contents/Resources/app-update.yml` → `app-update.yml.minimax-rtl-disabled` |
| `hot-update` (آپدیت داغ رندرر) | در `dist/main/modules/hotUpdate/config.js` تابع `resolveHotUpdateChannel` با `return null;` کوتاه می‌شود |

دومی حیاتی است: hot-update ریشهٔ رندرر را به پوشهٔ دیگری منتقل می‌کند و
فایل‌های پچ‌شدهٔ `out/` را بی‌اثر می‌کند.

---

## ۱۰) چرا `CFBundleIdentifier` عوض نمی‌شود؟

`com.minimax.agent` دست‌نخورده می‌ماند، چون به آن وابسته است:

- کلید Keychain (safeStorage) و کوکی‌های نشست
- ثبت پروتکل `archon-chat://` و deep linkها
- مسیرهای دادهٔ محلی و پیکربندی runtime

جداسازی userData (بخش ۷) همان هدف «اجرای هم‌زمان» را تأمین می‌کند، بدون
شکستن هویت اپ.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

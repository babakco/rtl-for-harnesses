# ۴) روش‌های بازبینی و نتایج

---

## ۱) بازبینی خودکار باندل

```bash
node patches/scripts/verify-asar.mjs "/Applications/MiniMax Code-RTL.app"
```

ده گروه بررسی انجام می‌شود:

| # | گروه | بررسی |
| --- | --- | --- |
| ۱ | ساختار asar | خواندن هدر، اندازهٔ ناحیهٔ داده |
| ۲ | `ElectronAsarIntegrity` | تطابق SHA256 هدر asar با مقدار داخل `Info.plist` |
| ۳ | فایل‌های پچ‌شده | وجود نشانه‌ها در `preload.js`، `model-menu-preload.js`، `index.js`، `hotUpdate/config.js` |
| ۴ | دارایی‌های RTL | وجود `rtl.css`، `rtl-autodir.js` و فونت‌ها در هر ریشه |
| ۵ | تزریق HTML | همهٔ صفحه‌های رندرر باید `data-minimax-rtl-asset` داشته باشند |
| ۶ | صحت HTML | باز بودن/بسته بودن `head` بعد از تزریق |
| ۷ | نام اپ و updater | `CFBundleDisplayName` و غیرفعال‌بودن `app-update.yml` |
| ۸ | امضا | `codesign --verify --deep --strict` |
| ۹ | فراداده | خواندن `minimax-rtl/PATCH-INFO.json` |

نتیجهٔ آخرین اجرا: **همهٔ بررسی‌ها موفق**.

---

## ۲) بازبینی خوانایی asar با ابزار واقعی Electron

```bash
npx asar list "/Applications/MiniMax Code-RTL.app/Contents/Resources/app.asar" | grep minimax-rtl
npx asar extract-file "/Applications/MiniMax Code-RTL.app/Contents/Resources/app.asar" out/minimax-rtl/rtl.css
```

این کار ثابت می‌کند که asar پچ‌شده با پیاده‌سازی واقعی `@electron/asar`
(همان که Electron استفاده می‌کند) سالم خوانده می‌شود.

---

## ۳) بازبینی نحوی فایل‌های main process

```bash
node --check /tmp/patched-dist_main_index.js
node --check /tmp/patched-dist_main_preload.js
node --check /tmp/patched-dist_main_model-menu-preload.js
node --check /tmp/patched-dist_main_modules_hotUpdate_config.js
```

(فایل‌ها باید از asar پچ‌شده استخراج شوند، نه از نسخهٔ اصلی.)

---

## ۴) تست DOM جهت‌دهی (مهم‌ترین بازبینی)

`tests/fixture.html` همان دو فایلی را بارگذاری می‌کند که واقعاً داخل اپ
تزریق می‌شوند:

```html
<link rel="stylesheet" href="../patches/rtl-inline.css">
<script src="../patches/rtl-autodir.js" defer></script>
```

و DOMی می‌سازد که ساختار اپ را تقلید می‌کند: پاراگراف‌های گفت‌وگو،
پرسش چندگزینه‌ای، نمایشگر کد (`.code-view-line-body`)، نمایشگر فایل متنی
(`.ofv-text-block`) و کامپوزر.

### اجرا

فایل را در مرورگر باز کنید:

```bash
open tests/fixture.html
```

نتیجه داخل `window.__RTL_TEST__` و در پایین صفحه نمایش داده می‌شود.
برای اجرای بدون‌مرورگر (headless) با CDP:

```js
// در DevTools console
__RTL_TEST__   // { pass: 21, fail: 0, total: 21, lines: [...] }
```

### سنجه‌ها (۲۱ سنجه)

| گروه | سنجه‌ها |
| --- | --- |
| پاراگراف فارسی | «سلام دنیا» ⇒ rtl |
| شروع با انگلیسی | «Hello سلام دنیا» ⇒ rtl |
| شروع با پرانتز | «(توجه) این مهم است» ⇒ rtl |
| شروع با عدد/خط تیره | «2024-01-01 گزارش روز» ⇒ rtl |
| متن انگلیسی | «Hello world» ⇒ ltr |
| فقط عدد | «1234» ⇒ دست‌نخورده (`dir` ندارد) |
| عنوان پرسش | «کدام روش را انتخاب می‌کنید؟» ⇒ rtl |
| گزینهٔ فارسی | ⇒ rtl |
| گزینهٔ انگلیسی | ⇒ ltr |
| خط کد انگلیسی | ⇒ ltr |
| خط کد با توضیح فارسی | ⇒ rtl |
| فایل متنی چندخطی | هر خط جداگانه: ltr / rtl / ltr |
| کامپوزر | تایپ فارسی ⇒ rtl، انگلیسی ⇒ ltr |
| فونت | `document.fonts.check("16px Vazirmatn") === true` |
| استایل فارسی | `direction: rtl` + `text-align: right` |
| استایل انگلیسی | `direction: ltr` (بررسی Regression §۳.۱ گزارش کار) |
| فونت مؤثر | `font-family` شامل Vazirmatn |

**نتیجهٔ آخرین اجرا: ۲۱ PASS / ۰ FAIL.**

---

## ۵) بازبینی نهایی روی خود اپ

### محدودیت محیط (مستند شده)

در نشستی که این پچ ساخته شد، **هیچ اپ گرافیکی** قابل اجرا نبود — و این شامل
**نسخهٔ اصلی** هم می‌شد. شواهد:

| بررسی | نتیجه |
| --- | --- |
| `open "/Applications/MiniMax Code.app"` (اصلی) | هیچ process، هیچ لاگ |
| `open "/Applications/MiniMax Code-RTL.app"` | هیچ process، هیچ لاگ |
| اجرای مستقیم از ترمینال | خروج فوری با کد ۰ و بدون خروجی |
| `osascript` (بررسی process list) | روی درخواست دسترسی گیر می‌کند |
| لاگ unified سیستم | `launchd` نسخهٔ **اصلی** را هم spawn می‌کند (`SPAWNED, code = 0`) و بلافاصله می‌میرد |

یعنی محدودیت از **محیط** است، نه از پچ. برای همین بازبینی رندر به تست DOM در
Chromium واقعی منتقل شد (بخش ۴) — که همان فایل‌هایی را می‌آزماید که واقعاً
داخل اپ تزریق می‌شوند (تطابق بایت‌به‌بایت در بازبینی خودکار تضمین شده است).

### چک‌لیست چشمی برای کاربر

- [ ] `open "/Applications/MiniMax Code-RTL.app"` → اپ بالا می‌آید.
- [ ] نام اپ در Dock و Finder «MiniMax Code-RTL» است.
- [ ] نسخهٔ اصلی (`MiniMax Code.app`) هم‌زمان باز است و هر دو کار می‌کنند.
- [ ] در گفت‌وگو، متن فارسی راست‌چین و با فونت Vazirmatn است.
- [ ] متن انگلیسی چپ‌چین مانده است.
- [ ] کامپوزر با تایپ فارسی راست‌چین می‌شود.
- [ ] توضیحات گزینه‌های پرسش چندگزینه‌ای فارسی راست‌چین است.
- [ ] یک فایل متنی/کد فارسی باز می‌شود → خط‌های فارسی راست‌چین.
- [ ] پنجرهٔ لاگ و پاپ‌آپ انتخاب مدل هم فونت فارسی دارند.

- [ ] `open "/Applications/MiniMax Code-RTL.app"` → اپ بالا می‌آید.
- [ ] نام اپ در Dock و Finder «MiniMax Code-RTL» است.
- [ ] نسخهٔ اصلی (`MiniMax Code.app`) هم‌زمان باز است و هر دو کار می‌کنند.
- [ ] در گفت‌وگو، متن فارسی راست‌چین و با فونت Vazirmatn است.
- [ ] متن انگلیسی چپ‌چین مانده است.
- [ ] کامپوزر با تایپ فارسی راست‌چین می‌شود.
- [ ] توضیحات گزینه‌های پرسش چندگزینه‌ای فارسی راست‌چین است.
- [ ] یک فایل متنی/کد فارسی باز می‌شود → خط‌های فارسی راست‌چین.
- [ ] پنجرهٔ لاگ و پاپ‌آپ انتخاب مدل هم فونت فارسی دارند.

اگر موردی خراب بود: [`05-troubleshooting.md`](05-troubleshooting.md).

---

## ۶) ثبت نسخهٔ پچ

`minimax-rtl/PATCH-INFO.json` داخل asar شامل زمان پچ، نسخهٔ اپ مبدأ، مسیر
خروجی و فهرست فایل‌های تغییریافته/اضافه‌شده است:

```json
{
  "patch": "minimax-rtl",
  "patchedAt": "2026-10-20T08:24:03.460Z",
  "sourceVersion": "3.1.4",
  "displayName": "MiniMax Code-RTL",
  "files": { "modified": [...], "added": [...] }
}
```
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

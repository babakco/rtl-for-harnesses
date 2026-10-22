# ۵) اشکال‌زدایی

> اول از همه: در ۹۰٪ موارد، اجرای دوبارهٔ `./apply-patch.sh` همه‌چیز را درست
> می‌کند، چون پچر همیشه از روی نسخهٔ اصلی و دست‌نخورده بازسازی می‌کند.

---

## ۱) اپ بالا نمی‌آید / فوراً بسته می‌شود

**۱-۱) بررسی کنید که نسخهٔ اصلی هم بالا می‌آید:**

```bash
open "/Applications/MiniMax Code.app"
```

اگر نسخهٔ اصلی هم بالا نمی‌آید، مشکل از پچ نیست.

> **نکتهٔ مهم دربارهٔ امضا:** نسخهٔ اصلی با گواهی Developer ID
> («Huigu (Zhengzhou) Network Technology Co., Ltd») امضا شده، ولی نسخهٔ RTL
> چون محتوایش تغییر کرده با **امضای ad-hoc** دوباره امضا می‌شود. macOS در
> لاگ سیستم پیام‌هایی مثل این می‌نویسد:
>
> ```
> amfid: ... not valid: Error Domain=AppleMobileFileIntegrityError Code=-423
>         "The file is adhoc signed or signed by an unknown certificate chain"
> ```
>
> این پیام **طبیعی و بی‌خطر** است: چون اپ با `cp -R` ساخته شده و
> صفت `com.apple.quarantine` ندارد، Gatekeeper جلوی اجرای آن را نمی‌گیرد.
> (همین روش در پروژه‌های خواهر `Kimi-RTL` و `Cline-RTL` هم استفاده شده است.)
>
> اگر خواستید اپ را به یک محیط دیگر منتقل کنید، ابتدا
> `xattr -dr com.apple.quarantine "/Applications/MiniMax Code-RTL.app"` بزنید.

**۱-۲) امضا را بررسی کنید:**

```bash
codesign --verify --deep --strict "/Applications/MiniMax Code-RTL.app"
codesign -d --entitlements - "/Applications/MiniMax Code-RTL.app" | head -20
```

اگر امضا خراب است، دوباره اجرا کنید:

```bash
codesign --force --deep --sign - "/Applications/MiniMax Code-RTL.app"
```

**۱-۳) لاگ‌های اپ:**

```bash
ls -t ~/Library/Logs/"MiniMax Agent"/*.log | head -3
tail -50 "$(ls -t ~/Library/Logs/'MiniMax Agent'/main-*.log | head -1)"
```

> توجه: چون `app.setName("MiniMax Agent")` عوض نشده، لاگ نسخهٔ RTL و اصلی
> در **همان پوشه** نوشته می‌شود.

---

## ۲) فونت فارسی اعمال نمی‌شود

**۲-۱) مطمئن شوید فایل‌ها داخل asar هستند:**

```bash
npx asar list "/Applications/MiniMax Code-RTL.app/Contents/Resources/app.asar" | grep minimax-rtl
```

باید `out/minimax-rtl/rtl.css`، `out/minimax-rtl/rtl-autodir.js` و
`out/minimax-rtl/fonts/*.woff2` را ببینید.

**۲-۲) در DevTools اپ بررسی کنید** (⌥⌘I یا از منو):

```js
// آیا نشانه‌ها ست شده‌اند؟
document.documentElement.getAttribute("data-minimax-rtl");        // "1" یا null
document.documentElement.getAttribute("data-minimax-rtl-preload"); // "1" یا null

// آیا استایل تزریق شده؟
[...document.styleSheets].some(s => (s.ownerNode?.id || s.ownerNode?.textContent || "").includes("Vazirmatn"))

// آیا فونت بارگذاری شده؟
document.fonts.check("16px Vazirmatn")
```

اگر `data-minimax-rtl-preload` هم null است، یعنی preload تزریق نشده ⇒
`dist/main/preload.js` در نسخهٔ جدید اپ تغییر کرده ⇒ بخش ۷ را ببینید.

---

## ۳) متن فارسی راست‌چین نمی‌شود

**۳-۱) اسکریپت جهت‌دهی اجرا شده؟**

```js
typeof window.__MINIMAX_RTL_ACTIVE__      // "boolean"
document.querySelectorAll(".minimax-rtl-auto").length   // > 0
```

اگر `0` بود، MutationObserver یا اجرای اسکریپت مشکل دارد.

**۳-۲) یک عنصر را دستی بررسی کنید:**

```js
const el = [...document.querySelectorAll("p")].find(p => /[؀-ۿ]/.test(p.textContent));
el?.getAttribute("dir");     // انتظار: "rtl"
```

**۳-۳) تست محلی:** `open tests/fixture.html` — اگر تست‌ها پاس شوند ولی در
اپ پاس نشوند، مشکل از تزریق است نه از منطق.

---

## ۴) متن انگلیسی هم راست‌چین شد

این Regression مربوط به `docs/03-work-report.md` §۳.۱ است. نشانه‌اش این است
که در `rtl.css` قانون `direction: rtl !important` روی `.minimax-rtl-auto`
(به‌جای `.minimax-rtl-rtl`) اعمال شده باشد.

بررسی:

```bash
grep -n "minimax-rtl-auto {" patches/rtl.css -A 3
grep -n "minimax-rtl-rtl {" patches/rtl.css -A 3
```

درست: `.minimax-rtl-auto` فقط `unicode-bidi` دارد و `.minimax-rtl-rtl`
دارای `direction: rtl !important` است.

---

## ۵) اپ و نسخهٔ اصلی هم‌زمان اجرا نمی‌شوند

نشانه: نسخهٔ RTL بلافاصله بسته می‌شود یا نسخهٔ اصلی فوکوس می‌گیرد.

علت محتمل: userData مشترک ⇒ قفل single-instance مشترک.

```bash
ls -d ~/Library/Application\ Support/MiniMax* 
```

باید **دو** پوشه باشد: `MiniMax Agent` (اصلی) و `MiniMax Code-RTL` (RTL).

اگر فقط یکی هست، تزریق جداسازی userData اعمال نشده ⇒ در `dist/main/index.js`
دنبال `MINIMAX_RTL_USERDATA` بگردید.

---

## ۶) بعد از به‌روزرسانی اپ، پچ از کار افتاد

حالت ممکن: hot-update رندرر را جایگزین کرده یا اپ خودش به‌روزرسانی شده و
`out/` پچ‌شده را با نسخهٔ تازه پوشانده است.

```bash
# ببینید hot-update غیرفعال است یا نه
npx asar extract-file "/Applications/MiniMax Code-RTL.app/Contents/Resources/app.asar" \
  dist/main/modules/hotUpdate/config.js | grep -A 3 "MINIMAX_RTL_NO_HOT_UPDATE"
```

راه‌حل: اجرای دوبارهٔ `./apply-patch.sh`.

---

## ۷) پچر روی نسخهٔ جدید اپ هشدار می‌دهد

پچر عمداً **هشدار می‌دهد و ادامه می‌دهد** (نمی‌میرد) وقتی الگویی که انتظار
داشته را پیدا نکند:

| هشدار | معنی | اقدام |
| --- | --- | --- |
| `preload.js پیدا نشد` | مسیر preload در نسخهٔ جدید عوض شده | مسیر جدید preload را در `patch-asar.mjs` پیدا و به `preloadTargets` اضافه کنید |
| `الگوی setName پیدا نشد` | ساختار `dist/main/index.js` عوض شده | محل `app.setName` را پیدا و الگو را اصلاح کنید |
| `الگوی resolveHotUpdateChannel پیدا نشد` | مکانیزم hot-update عوض شده | فایل/تابع جدید را پیدا کنید |
| `۰ فایل HTML تزریق شد` | مسیر رندرر عوض شده | `out/` → مسیر جدید را در `patch-asar.mjs` اصلاح کنید |

راهنمای کامل: [`06-update-playbook.md`](06-update-playbook.md).

---

## ۸) فونت در پاپ‌آپ انتخاب مدل کار نمی‌کند

پاپ‌آپ مدل با `file://` لود می‌شود و CSP سخت‌گیرانه دارد
(`font-src 'self'`). پچ این کار را می‌کند:

- `font-src 'self'` ⇒ `font-src 'self' data:`
- نسخهٔ inline فونت (data-URI) در `dist/model-menu/minimax-rtl/rtl.css`

بررسی:

```bash
npx asar extract-file "/Applications/MiniMax Code-RTL.app/Contents/Resources/app.asar" \
  dist/model-menu/index.html | grep -E "font-src|minimax-rtl"
```

---

## ۹) حذف کامل و ساخت دوباره

```bash
./restore.sh
./apply-patch.sh
```

اگر `restore.sh` گیر کرد:

```bash
pkill -f "MiniMax Code"
rm -rf "/Applications/MiniMax Code-RTL.app"
```

---

## ۱۰) پاک‌سازی دادهٔ نسخهٔ RTL (مثلاً برای تست ورود از صفر)

```bash
rm -rf ~/Library/Application\ Support/"MiniMax Code-RTL"
```

توجه: این کار **نشست/کوکی‌ها** را پاک می‌کند و باید دوباره وارد حساب شوید.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

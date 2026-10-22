# ۶) راهنمای به‌روزرسانی پس از آپدیت MiniMax Code

---

## ۱) چرخهٔ کاری

```
MiniMax Code.app  ──(آپدیت خودکار توسط سازنده)──▶  MiniMax Code.app (نسخهٔ جدید)
        │
        │  ./apply-patch.sh
        ▼
MiniMax Code-RTL.app  (نسخهٔ جدید + پچ RTL)
```

نسخهٔ RTL **خودش را بروزرسانی نمی‌کند** (updater و hot-update غیرفعال‌اند)،
پس همیشه یک نسخهٔ پچ‌شده دارید و کنترل کامل در دست شماست.

---

## ۲) بعد از هر آپدیت، این سه دستور

```bash
cd harnesses/minimax-code

# ۱) پچر را روی نسخهٔ جدید اجرا کنید (خروجی قبلی را پاک و بازسازی می‌کند)
./apply-patch.sh

# ۲) تست DOM را اجرا کنید
open tests/fixture.html     # باید ۲۱/۲۱ PASS بدهد

# ۳) اپ را باز کنید و چک‌لیست چشمی را انجام دهید
open "/Applications/MiniMax Code-RTL.app"
```

`apply-patch.sh` **idempotent** است: خروجی قبلی را حذف می‌کند و از نو از روی
نسخهٔ اصلی می‌سازد. پس اجرای دوباره‌اش هیچ خطری ندارد.

---

## ۳) چه چیزهایی ممکن است بعد از آپدیت بشکند

پچر تا حد زیادی **کشف‌پویا** است (فایل‌های HTML را از روی هدر asar پیدا
می‌کند)، ولی این نقاط به ساختار اپ وابسته‌اند:

| نقطهٔ وابستگی | اگر عوض شود چه می‌شود | راه‌حل |
| --- | --- | --- |
| مسیر `dist/main/preload.js` | قلاب preload اعمال نمی‌شود ⇒ فقط مسیر HTML کار می‌کند | مسیر جدید را به `preloadTargets` در `patch-asar.mjs` اضافه کنید |
| مسیر `dist/main/model-menu-preload.js` | پاپ‌آپ مدل RTL نمی‌شود | همان |
| محل `app.setName(APP_NAME)` در `dist/main/index.js` | userData جدا نمی‌شود ⇒ تداخل single-instance | الگوی `setName` را در پچر اصلاح کنید |
| تابع `resolveHotUpdateChannel` در `dist/main/modules/hotUpdate/config.js` | hot-update دوباره فعال می‌شود | الگو را اصلاح کنید |
| نام متغیرهای فونت `--mcode-font-family-*` | فونت رابط اعمال نمی‌شود | نام جدید را در `patches/rtl.css` به‌روزرسانی کنید |
| کلاس‌های نمایشگر کد/فایل | جهت‌دهی کد/فایل دقیق نمی‌شود | `CODE_LINE_SEL` و `LINE_SPLIT_SEL` را در `patches/rtl-autodir.js` به‌روزرسانی کنید |
| ساختار `app.asar` (header/integrity) | جراحی asar می‌شکند | بخش ۵ را ببینید |

---

## ۴) گام‌های تشخیص بعد از آپدیت

### گام ۱: ببینید پچر چه هشدارهایی داده

```bash
./apply-patch.sh 2>&1 | grep -E "warn|FATAL"
```

هشدارها یعنی پچر چیزی را پیدا نکرده ⇒ آن قابلیت در نسخهٔ جدید اعمال
نمی‌شود.

### گام ۲: ساختار asar نسخهٔ جدید را بررسی کنید

بدون extract کردن ۴۰۰MB، با این اسکریپت:

```bash
node -e '
const fs=require("fs");
const p="/Applications/MiniMax Code.app/Contents/Resources/app.asar";
const fd=fs.openSync(p,"r");
const b=Buffer.alloc(16); fs.readSync(fd,b,0,16,0);
const region=b.readUInt32LE(4), jsonLen=b.readUInt32LE(12);
const jb=Buffer.alloc(jsonLen); fs.readSync(fd,jb,0,jsonLen,16);
const header=JSON.parse(jb.toString("utf8"));
function ls(pp){const n=pp.split("/").filter(Boolean).reduce((a,s)=>a.files?a.files[s]:null,header);
  console.log(pp,"→",n&&n.files?Object.keys(n.files).join(", "):(n?"(file "+n.size+")":"NOT FOUND"));}
["dist/main","dist/main/preload.js","dist/main/model-menu-preload.js",
 "dist/main/modules/hotUpdate/config.js","out","dist/model-menu/index.html"]
 .forEach(l=>ls(l));
'
```

### گام ۳: مقایسه کنید با ساختار ثبت‌شده در `docs/01-architecture.md`

اگر مسیرها عوض شده‌اند، `patch-asar.mjs` را اصلاح کنید.

### گام ۴: تست DOM را اجرا کنید

تست DOM به ساختار اپ وابسته نیست (ساختار DOM را خودش می‌سازد)، پس اگر
۲۱/۲۱ پاس شود یعنی **منطق** سالم است و مشکل فقط در نقطهٔ تزریق است.

---

## ۵) اگر ساختار asar عوض شد

سه سناریو:

### سناریوی الف) فقط blockSize عوض شد
پچر آن را خودکار کشف می‌کند (`detectBlockSize`) ⇒ کاری لازم نیست.

### سناریوی ب) hash الگوریتم عوض شد
اگر `Info.plist` مقدار `algorithm` دیگری داشت، تابع `integrityOf` را در
`patch-asar.mjs` اصلاح کنید.

### سناریوی ج) قالب header عوض شد
تابع `readAsarHeader`/`writeAsarHeader` را با نسخهٔ جدید Electron تطبیق دهید
(مرجع: `shell/common/asar/archive.cc`).

راه‌حل جایگزین و ساده‌تر: اگر قالب کاملاً عوض شده، به‌جای جراحی asar از
`@electron/asar` استفاده کنید — ولی حتماً باید الگوی `unpacked` را دقیقاً
بازتولید کنید وگرنه باینری‌های native بارگذاری نمی‌شوند. (به همین دلیل
جراحی asar ترجیح دارد.)

---

## ۶) چک‌لیست نهایی بعد از هر آپدیت

- [ ] `./apply-patch.sh` بدون هشدار و بدون FATAL تمام شد
- [ ] `verify-asar.mjs` همهٔ بررسی‌ها را پاس کرد
- [ ] `open tests/fixture.html` ⇒ ۲۱/۲۱ PASS
- [ ] اپ RTL بالا آمد و نامش در Dock «MiniMax Code-RTL» است
- [ ] نسخهٔ اصلی هم‌زمان اجرا می‌شود
- [ ] فونت فارسی و جهت راست‌چین در گفت‌وگو درست است
- [ ] فایل فارسی بازشده درست نمایش داده می‌شود
- [ ] پرسش چندگزینه‌ای با گزینه‌های فارسی درست است

---

## ۷) ثبت نسخه

بعد از هر آپدیت، نسخهٔ هدف را در جدول «نسخهٔ هدف» در `README.md` به‌روزرسانی
کنید و در `docs/03-work-report.md` یک ردیف جدید اضافه کنید تا تاریخچهٔ
تغییرات پچ ثبت شود.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

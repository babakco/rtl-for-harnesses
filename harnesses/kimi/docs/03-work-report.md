# گزارش کارهای انجام‌شده

هدف: ساخت یک پچ قابل‌تکرار روی `Kimi.app` که (۱) فونت Vazirmatn را اعمال کند و
(۲) هر بلوکی که حرف فارسی دارد را RTL کند — هم در محل تایپ و هم در پاسخ مدل —
بدون تغییر در نسخهٔ اصلی، و مستندسازی کامل.

---

## فاز ۱ — شناسایی و تحلیل

1. **نصب‌های موجود**: `/Applications/Kimi.app` (اصل) و `/Applications/Kimi RTL.app` (خروجی قبلی).
2. **مشخصات باندل**: نسخهٔ 3.2.14، Electron 43.7.3، `app.asar` 116MB.
3. **استخراج asar و بررسی محتوا**: مشخص شد اپ یک **Vue SPA محلی** است
   (`app://localhost/kimi-agent.html`) که وب‌اپ چت `https://www.kimi.ai/` را هم بارگذاری می‌کند.
   این نکته مسیر پچ را تعیین کرد: **تزریق در main process + preload**، نه ویرایش HTML.
4. **کشف دو مانع اصلی پچ‌کردن**:
   - `ElectronAsarIntegrity` در `Info.plist` (fuse فعال)
   - helper appهای تغییرنام‌یافته (الکترون ۴۳: چک `PathExists` روی خود فایل اجرایی)
5. **۹ فایل با پرچم `unpacked`** در `app.asar.unpacked` شناسایی شد.

## فاز ۲ — خطاهای رفع‌شده (به‌ترتیب وقوع)

| # | خطا | علت | راه‌حل |
| --- | --- | --- | --- |
| ۱ | `FATAL:electron_main_delegate_mac.mm:66] Unable to find helper app` | فقط پوشهٔ helper تغییر نام داده بود؛ Electron وجود *فایل اجرایی* را چک می‌کند | تغییر نام پوشه + فایل اجرایی داخل `Contents/MacOS` + اصلاح plist همان helper |
| ۲ | `FATAL:asar_util.cc:187] Integrity check failed for asar archive entry '<header>'` | محاسبهٔ غلط طول JSON هدر (`pickleSize − 8`) | خواندن `u32@12` به‌عنوان `jsonLen` و هش‌کردن بایت‌های `[16, 16+jsonLen)` |
| ۳ | خراب‌شدن کل `Info.plist` (جایگزینی با JSON بی‌معنا) | `PlistBuddy` با کلید حاوی `/` رفتار غیرقابل‌اعتماد دارد | ویرایش امن XML با regex روی همان ترتیب اصلی |
| ۴ | `CFBundleName` با مقدار `Kimi RTL.app` | پسوند `.app` اشتباهاً در نام باندل رفته بود | نام بدون پسوند |
| ۵ | *(پیش‌بینی‌شده و رفع‌شده)* `Failed to read integrity for file in ASAR archive` | `@electron/asar` بلوک integrity هر فایل را تولید نمی‌کند | کنار گذاشتن extract/pack و پیاده‌سازی «جراحی asar» |
| ۶ | preload هرگز اجرا نمی‌شد | `session.registerPreloadScript` در این ترکیب برای پنجره‌هایی که `webPreferences.preload` صریح دارند عملاً بی‌اثر بود | تزریق در preloadهای خود اپ (مسیر تضمینی) + لایهٔ `dom-ready` |
| ۷ | نشانهٔ اجرا (`data-kimi-rtl`) ست نمی‌شد | در زمان اجرای preload، `document.documentElement` هنوز `null` است | تابع `mark()` با تلاش مجدد روی `DOMContentLoaded` |
| ۸ | جهت‌دهی متن‌های تازه عقب می‌افتاد | `requestAnimationFrame` در پنجره‌های مخفی/غیرفعال اجرا نمی‌شود | جایگزینی با `setTimeout(flush, 16)` + اسکن تکمیلی روی `load` |
| ۹ | `app-update.yml` در asar پیدا نمی‌شد | این فایل **بیرون** asar و در `Contents/Resources/` است | تغییر نام همان فایل در کلون (لایهٔ فایل‌سیستم) |

## فاز ۳ — پیادهٔ‌سازی

- `patches/rtl.css` — استایل RTL + سه `@font-face`.
- `patches/rtl-autodir.js` — بازنویسی کامل: قاعدهٔ «حرف فارسی ⇒ RTL»، استثنای
  کد/فرمول/نمودار، batch 16ms، پشتیبانی زندهٔ کامپوزر و `load`/`input`/`paste`.
- `patches/rtl-main-bootstrap.mjs` — ثبت زودهنگام preload روی همهٔ sessionها
  (`app.on("session-created")` + `app.on("ready")`)، لایهٔ اطمینان `dom-ready`
  و گزارش تشخیصی اختیاری.
- `patches/scripts/build-preload.cjs.js` — تولید `rtl-preload.cjs`،
  `rtl-preload.mjs` و `rtl-inline.css` با فونت‌های data-URI.
- `patches/scripts/patch-asar.mjs` — بازنویسی کامل به‌صورت **جراحی asar**:
  کلون → تزریق `import` در `out/main/index.js` → تزریق در ۱۰ preload اپ →
  افزودن ۷ فایل `kimi-rtl/` → بازمحاسبهٔ هش هدر و نوشتن در plist →
  تغییر نام helperها → غیرفعال‌سازی updater → کدساین ad-hoc.
- `patches/scripts/verify-asar.mjs` — بازبینی خودکار یکپارچگی.
- `apply-patch.sh` / `restore.sh` — گردش‌کار یک‌خطی.
- فونت‌ها + `OFL.txt` در `patches/assets/`.

## فاز ۴ — راستی‌آزمایی

با اجرای واقعی اپ و گزارش تشخیصی (`KIMI_RTL_DEBUG=1`) تأیید شد:

- ✅ اپ بدون هیچ خطای FATAL بالا می‌آید؛ ۹۰۲ فایل asar با integrity معتبر.
- ✅ هر سه مسیر تزریق preload فعال هستند (نشانه: `data-kimi-rtl-src="cjs+mjs"`).
- ✅ فونت Vazirmatn روی همهٔ صفحات اعمال و لود می‌شود.
- ✅ آزمون زندهٔ `Run 123 test — سلام دنیای فارسی!` در **هر چهار** WebContents
  مقدار `dir="rtl"` و `text-align: start` گرفت.
- ✅ در وب‌اپ واقعی چت (`https://www.kimi.ai/`) ۱۶ بلوک واقعی RTL علامت خوردند.
- ✅ `codesign --verify --deep --strict` موفق.

جدول کامل خروجی‌ها: [04-verification.md](04-verification.md).

## فاز ۵ — مستندسازی

`README.md` + `docs/01…05` + `research/electron-sources.md` (همه در همین ریپو).

---

## کارهای باقی‌مانده / پیشنهادها

- **تست چشمی با محتوای فارسی واقعی** (نیازمند ورود کاربر به کیمی و دیدن پنجره):
  بررسی هم‌ترازی فهرست‌ها، جدول‌ها و نقل‌قول‌ها در بندهای RTL.
- اگر لازم شد، افزودن **کلید میان‌بر یا منوی کوچک** برای خاموش/روشن‌کردن جهت‌دهی
  بدون بستن اپ.
- بررسی رفتار روی **نسخه‌های Intel** (مسیرهای helper و `out/native/darwin-x64`).
- افزودن تست خودکار (headless) با Electron برای `rtl-autodir` به‌جای آزمون زندهٔ دستی.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

# عیب‌یابی

## اپ بالا نمی‌آید

### `FATAL … Unable to find helper app`
یعنی نام helperها با `CFBundleName` هم‌خوان نیست. چک کنید:

```bash
plutil -extract CFBundleName raw "/Applications/Kimi RTL.app/Contents/Info.plist"
ls "/Applications/Kimi RTL.app/Contents/Frameworks/" | grep -i helper
ls "/Applications/Kimi RTL.app/Contents/Frameworks/Kimi RTL Helper.app/Contents/MacOS/"
```

- `CFBundleName` باید **بدون `.app`** باشد (مثلاً `Kimi RTL`).
- هم پوشهٔ `Frameworks/Kimi RTL Helper*.app` و هم فایل اجرایی داخل
  `Contents/MacOS/Kimi RTL Helper*` باید همریخت باشند.
- فقط تغییر نام پوشه کافی نیست (Electron وجود فایل اجرایی را چک می‌کند).

### `FATAL … Integrity check failed for asar archive entry '<header>'`
هش هدری که در `Info.plist` است با asar نمی‌خواند. علت رایج: دست‌کاری asar
بعد از پچ (یا محاسبهٔ هش با روش غلط).

```bash
node patches/scripts/verify-asar.mjs "/Applications/Kimi RTL.app"
```

راه درست محاسبه در [02-technical-notes.md](02-technical-notes.md#۲-فرمت-فایل-asar-و-بایتهایی-که-electron-هش-میکند).

### `FATAL … Failed to read integrity for file in ASAR archive`
asar با `@electron/asar pack` بازسازی شده است. این ابزار بلوک integrity هر فایل را
تولید نمی‌کند و در این اپ اجباری است. از `patch-asar.mjs` (روش جراحی) استفاده کنید.

### «اپ آسیب‌دیده یا خراب است» / Gatekeeper
پچ با امضای ad-hoc امضا می‌شود. یک‌بار روی آیکون راست‌کلیک → *Open*، یا:

```bash
xattr -dr com.apple.quarantine "/Applications/Kimi RTL.app"
```

### `signature OK` نیست
کدساین را دستی تکرار کنید:

```bash
codesign --force --deep --sign - "/Applications/Kimi RTL.app"
codesign --verify --deep --strict "/Applications/Kimi RTL.app"
```

---

## پچ اعمال شده ولی تغییری دیده نمی‌شود

۱) با حالت تشخیصی اجرا کنید:

```bash
pkill -f "Kimi RTL.app"; sleep 1
KIMI_RTL_DEBUG=1 "/Applications/Kimi RTL.app/Contents/MacOS/Kimi" > /tmp/kimi-rtl-run.log 2>&1 &
sleep 30
grep "Kimi-RTL" /tmp/kimi-rtl-run.log
```

۲) تفسیر خروجی:

| نشانه در لاگ | معنا |
| --- | --- |
| `bootstrap loaded` نیست | import تزریق نشده — `patch-asar.mjs` را دوباره اجرا کنید |
| `preload-marker=true` | preload اجرا شده ✅ |
| `preload-marker=false` و `fallback injection → …` | preload اجرا نشده و لایهٔ اطمینان وارد شده |
| در گزارش `vazir:false` | فونت لود نشده (مسیر data-URI خراب است) |
| در گزارش `testDir:null` | منطق جهت‌دهی اجرا نشده |
| در گزارش `rtl:0` با محتوای فارسی | بلوک متن شناسایی نشده (سلکتور بلوک‌ها را وسعت دهید) |

۳) موقتاً پچ را خاموش/روشن کنید تا مطمئن شوید تفاوت ناشی از پچ است:

```bash
KIMI_RTL_DISABLE=1 "/Applications/Kimi RTL.app/Contents/MacOS/Kimi"
```

---

## جهت‌دهی در بعضی جاها اعمال نمی‌شود

- **کد، فرمول و نمودار** عمداً مستثنا هستند (فونت مونو و جهت اصلی حفظ می‌شود).
- بلوک‌های متنی‌ای که با سلکتور یا «متن مستقیم» شناسایی نمی‌شوند ممکن است از قلم
  بیفتند. برای افزودن تگ جدید، `PLAIN_BLOCK`/`GENERIC` و سلکتور `querySelectorAll`
  در `patches/rtl-autodir.js` را گسترش دهید و بعد:

  ```bash
  node patches/scripts/build-preload.cjs.js
  node patches/scripts/patch-asar.mjs
  ```
- اگر متن خالی است یا فقط عدد/علائم دارد، هیچ `dir`ی ست نمی‌شود (این عمدی است تا
  placeholder و لیست‌های فنی بی‌جهت نمانند).

---

## کامپوزر (محل تایپ) RTL نمی‌شود

منطق کامپوزر روی رویدادهای `input`/`focusin`/`paste` کار می‌کند و هدف را
با `closest("[contenteditable]:not([contenteditable='false'])")`، `textarea` و
`input` متنی پیدا می‌کند. اگر Kimi کامپوزر را در یک `iframe` یا WebContents
جداگانه ساخته باشد، لایهٔ `dom-ready` آن را پوشش می‌دهد؛ در غیر این‌صورت در
`composerOf()` selector مناسب اضافه کنید.

---

## بروزرسانی Kimi و از دست رفتن پچ

این رفتار مورد انتظار است: Kimi نسخهٔ اصلی را در `/Applications/Kimi.app`
بروزرسانی می‌کند و نسخهٔ RTL دست‌نخورده می‌ماند (چون `app-update.yml` غیرفعال
شده). برای هم‌گام‌سازی:

```bash
./apply-patch.sh          # بازسازی کامل از نسخهٔ جدید
```

---

## پرسش‌های رایج

**آیا نسخهٔ اصلی تغییر می‌کند؟** نه. پچر فقط روی کلون کار می‌کند.

**ورود و تاریخچهٔ من چه می‌شود؟** هر دو اپ یک پروفایل مشترک دارند
(`~/Library/Application Support/kimi-desktop`)، پس ورود و تاریخچه مشترک است.
اجرای هم‌زمان هر دو توصیه نمی‌شود.

**چرا asar بزرگ‌تر می‌شود؟** چون `out/main/index.js` (۸.۹MB) در انتهای ناحیهٔ داده
بازنویسی می‌شود و نسخهٔ قبلی (که بایت‌های دیگر به آن وابسته‌اند) حذف‌شدنی نیست.

**چرا حجم هر preload ~۲۹۲KB است؟** فونت‌های Vazirmatn به‌صورت data-URI داخل آن
جاسازی شده‌اند تا مستقل از شبکه، پروتکل سفارشی و CSP کار کند.

**چرا قاعدهٔ «وجود حرف فارسی ⇒ RTL» و نه «اولین حرف قوی»؟** چون صریحاً درخواست شده
بود که جمله‌هایی که با انگلیسی یا علائم شروع می‌شوند هم در صورت داشتن حرف فارسی
راست‌چین شوند. الگوریتم استاندارد bidi («اولین حرف قوی») این حالت را LTR می‌کرد.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

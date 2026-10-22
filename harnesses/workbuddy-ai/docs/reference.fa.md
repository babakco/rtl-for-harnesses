# WorkBuddy AI — پچ RTL (فارسی + فونت Vazirmatn)

نسخه RTL از WorkBuddy AI می‌سازد: فونت سراسری Vazirmatn و راست‌به‌چپ شدن
خودکار هر متنی که حتی یک کاراکتر فارسی دارد — بدون دست‌زدن به نسخه اصلی.

## اجرا

```bash
./patch-workbuddy-rtl.sh
open -a "WorkBuddy AI RTL"
```

- مبدأ پیش‌فرض: `/Applications/WorkBuddy AI.app` (دست‌نخورده می‌ماند)
- خروجی: `/Applications/WorkBuddy AI RTL.app`
- متغیرهای اختیاری: `WORKBUDDY_SRC`، `WORKBUDDY_DST`
- پس از هر به‌روزرسانی WorkBuddy، دوباره همین اسکریپت را اجرا کنید.

## قوانین اعمال‌شده

| # | قانون |
|---|-------|
| ۱ | هر پاراگراف/جمله با حتی یک کاراکتر فارسی → کامل RTL (حتی با شروع انگلیسی یا علائم) |
| ۲ | پاراگراف/اسپن کاملاً انگلیسی → همیشه LTR، حتی زیر جد فارسی |
| ۳ | کانتینرهای ساختاری هرگز mark نمی‌شوند (فقط بلاک برگی) |
| ۴ | ورودی‌ها (input/textarea/contenteditable): جهت از روی محتوا با هر keystroke |
| ۵ | کد، ترمینال، فرمول ریاضی و آیکون‌ها همیشه LTR |

## فایل‌ها

| فایل | نقش |
|------|------|
| `patch-workbuddy-rtl.sh` | نقطه ورود: کپی، تزریق، امضا، راستی‌آزمایی |
| `inject-asar.js` | پچ جراحی asar بدون اکسترکت کامل |
| `workbuddy-rtl.js` | تشخیص و mark کردن جهت در زمان اجرا |
| `workbuddy-rtl.css` | فونت Vazirmatn + استایل RTL/LTR |

## نکات فنی مهم

### چرا تزریق جراحی به‌جای unpack کامل
`app.asar` با «بازنویسی هدر و جابه‌جایی فقط فایل‌های لازم» پچ می‌شود تا همه
offsetها، integrity هر فایل و لینک‌های `app.asar.unpacked` معتبر بمانند.

### دو حالت asar (packed / unpacked)
نسخه‌های مختلف WorkBuddy بسته‌بندی متفاوتی دارند:

- **۵.۷.x**: `renderer/index.html` به‌صورت packed داخل خود asar است.
- **۵.۸.x**: همه فایل‌های renderer روی دیسک و `unpacked: true` هستند.

`inject-asar.js` هر دو حالت را تشخیص می‌دهد و مطابق همان convention پیلود را
می‌نویسد (packed → ناحیه داده؛ unpacked → `app.asar.unpacked/` + فقط به‌روزرسانی
size/integrity در هدر).

### دو شل HTML، هر دو پچ می‌شوند
| شل | نقش |
|----|------|
| `renderer/index.html` | پنجره اصلی |
| `renderer/markdown-shared-guest.html` | iframe پیش‌نمایش فایل‌های باز |

این iframe یک سند **جداگانه و cross-origin** است (`http://127.0.0.1:<port>/static-html/...`)
پس رفتار پنجره اصلی هرگز به آن نمی‌رسد؛ پیلود باید داخل همان سند اجرا شود.

### فایل‌نامه allowlist مهمان (لازم و حیاتی)
`renderer/markdown-shared-guest-files.json` یک **allowlist** است که
`StaticHtmlHttpServer` هنگام سرو iframe از آن مشورت می‌گیرد. هر مسیری که در
`files` نباشد **403** می‌گیرد. پس تزریق‌کننده باید پیلود را در این فهرست هم
ثبت کند، وگرنه `<script>`/`<link>` اضافه‌شده هرگز بارگذاری نمی‌شود.

```
assets/workbuddy-rtl.css  ->  403  (بدون ثبت در فایل‌نامه)
assets/tokens-*.js        ->  200  (در فایل‌نامه هست)
```

### امضا و صحت asar
- فقط `CFBundleDisplayName` تغییر می‌کند؛ `CFBundleName` باید `"WorkBuddy AI"`
  بماند وگرنه Electron هلپرها را پیدا نمی‌کند (FATAL «Unable to find helper app»).
- کلید `ElectronAsarIntegrity` حذف نمی‌شود (فوز `EnableEmbeddedAsarIntegrityValidation`
  در نبودش trap می‌کند)؛ هش JSON هدر پس از تزریق دوباره ثبت می‌شود.
- امضای ad-hoc با `--preserve-metadata=entitlements,flags,runtime`؛ بدون آن
  entitlement `allow-jit` پاک می‌شود و V8 با `EXC_BREAKPOINT` کرش می‌کند.

## اشکال‌زدایی

اجرای اپ با پورت اشکال‌زدایی:

```bash
open -a "WorkBuddy AI RTL" --args --remote-debugging-port=9222 --user-data-dir=/tmp/wb-rtl-profile
curl -s http://127.0.0.1:9222/json/list
```

آمار داخلی پیلود: `window.__wbRtlStats` (flushes، queued، evals، slowFlush).

## تاریخچه نسخه‌ها

| نسخه | تغییر |
|------|-------|
| ۱.۱.۰ | پایه: mark با کلاس + CSS؛ پشتیبانی asar packed |
| ۱.۲.۰ | جهت پویا برای ورودی‌ها؛ `isEditable` برای contenteditable |
| ۱.۳.۰ | حذف رصد اتریبیوت class (حلقه پینگ‌پنگ با React → هنگ رندرر)؛ سقف ضدطوفان در flush |
| ۱.۴.۰ | خروج `U+FEFF` از بازه فارسی (BOM در متن انگلیسی، پاراگراف انگلیسی را RTL می‌کرد)؛ پاس اینلاین برای ریست LTR؛ پچ شل مهمان |
| ۱.۵.۰ | ثبت پیلود در allowlist فایل‌نامه مهمان (رفع 403 و بی‌اثر بودن پچ در پیش‌نمایش فایل)؛ توقف mark درون‌خطی داخل ادیتور (رفع به‌هم‌ریختگی ترتیب کلمات) |
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

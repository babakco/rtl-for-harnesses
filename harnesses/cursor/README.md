# Cursor RTL

## ۱) این هارنس چه می‌کند

از نسخهٔ نصب‌شدهٔ **Cursor** یک کپی مستقل می‌سازد:

```text
/Applications/Cursor.app  →  /Applications/Cursor-RTL.app
```

نسخهٔ اصلی دست‌نخورده می‌ماند. در نسخهٔ RTL:

- فونت متن فارسی **Vazirmatn** است.
- هر پاراگراف، آیتم لیست، تیتر، نقل‌قول یا سلول جدولی که حتی یک حرف
  فارسی داشته باشد، کامل RTL می‌شود؛ حتی اگر با انگلیسی، عدد یا علائم
  شروع شده باشد.
- متن کاملاً انگلیسی LTR می‌ماند.
- چت/ایجنت، حباب کاربر، ورودی ProseMirror و Markdown پوشش داده می‌شوند.
- متن تایپ‌شده: با تایپ حتی یک حرف فارسی، کل باکس ورودی RTL و وزیرمتن
  می‌شود (این آینه‌شدن کل باکس، رفتار عمدی است)؛ با پاک شدن فارسی یا
  انگلیسی خالص، ورودی به LTR برمی‌گردد.
- کد، بلاک کد، کد inline، Monaco، ترمینال و فرمول همیشه LTR و monospace
  می‌مانند.
- منو، سایدبار، تنظیمات و عنوان‌های تاریخچهٔ چت در این نسخه عمداً
  دست‌نخورده می‌مانند.

## ۲) وضعیت نسخه

| مورد | مقدار |
|---|---|
| نسخهٔ مبدأ | `3.26.16` |
| روش | `electron-unpacked` |
| پروفایل | مشترک (`~/Library/Application Support/Cursor`) |
| حالت | copy mode؛ نسخهٔ اصلی تغییر نمی‌کند |
| آپدیت خودکار | خاموش شده تا پچ با آپدیت رسمی بازنویسی نشود |

`testedVersion` در manifest همان نسخه‌ای است که این پچ روی آن ساخته و
آزموده شده است. اگر Cursor جدیدتر باشد، `detect` وضعیت `version-drift`
نشان می‌دهد؛ build را دوباره اجرا کنید و نتیجه را بررسی کنید.

## ۳) پیش‌نیازها

- macOS روی Apple Silicon (خروجی Cursor فعلی `arm64` است).
- نصب بودن Cursor در `/Applications/Cursor.app`.
- بسته بودن کامل Cursor و Cursor-RTL هنگام build.
- `node`، `python3`، `ditto`، `plutil` و `codesign`.
- حدود ۱ گیگابایت فضای آزاد برای کپی برنامه.

## ۴) ساخت

از ریشهٔ مخزن:

```bash
./rtl-harness build cursor --dry-run
./rtl-harness build cursor --yes
```

یا مستقیم:

```bash
bash harnesses/cursor/patch-cursor-rtl.sh
```

اسکریپت اول بررسی می‌کند Cursor در حال اجرا نباشد، سپس خروجی قبلی را حذف
می‌کند، از نسخهٔ اصلی کپی می‌سازد، فایل‌های RTL را تزریق می‌کند، چک‌سام
`workbench.html` را در `product.json` به‌روز می‌کند و برنامه را ad-hoc
امضا می‌کند.

مسیر خروجی:

```text
/Applications/Cursor-RTL.app
```

## ۵) تأیید

```bash
./rtl-harness verify cursor
./rtl-harness test cursor
```

بررسی دستی امضا و شناسه:

```bash
codesign --verify --deep --strict /Applications/Cursor-RTL.app
plutil -extract CFBundleIdentifier raw -o - /Applications/Cursor-RTL.app/Contents/Info.plist
```

شناسهٔ خروجی باید این باشد:

```text
com.todesktop.230313mzl4w4u92.rtl
```

## ۶) اجرا

```bash
open /Applications/Cursor-RTL.app
```

قبل از اجرا، Cursor اصلی را ببندید. پروفایل هر دو برنامه مشترک است و اجرای
هم‌زمان می‌تواند باعث قفل پروفایل یا رفتار غیرقابل‌پیش‌بینی شود.

برای آزمایش سریع، یک چت با متن فارسی و یک بلاک کد باز کنید. پاراگراف فارسی
باید راست‌چین و با فونت Vazirmatn باشد؛ بلاک کد باید چپ‌چین و monospace
بماند.

## ۷) بازگردانی/حذف

حذف نسخهٔ RTL هیچ اثری بر Cursor اصلی ندارد:

```bash
rm -rf /Applications/Cursor-RTL.app
```

## ۸) بعد از آپدیت upstream

1. Cursor اصلی را آپدیت کنید.
2. Cursor را کامل ببندید.
3. دوباره build کنید:

```bash
./rtl-harness build cursor --yes
```

آپدیت خودکار Cursor-RTL خاموش است؛ بنابراین خود برنامهٔ RTL به‌طور خودکار
به نسخهٔ رسمی Cursor تبدیل نمی‌شود. برای هر آپدیت، منبع اصلی را آپدیت و
پچ را دوباره اجرا کنید.

## ۹) هشدارها

- **پروفایل مشترک:** `CFBundleName` عمداً `Cursor` مانده تا Electron
  هلپرها را پیدا کند. به همین دلیل پروفایل هر دو برنامه یکی است؛ هم‌زمان
  اجرا نکنید.
- **طرح URL:** scheme `cursor` تغییر نکرده تا لاگین و deep linkهای Cursor
  نشکنند. اگر Cursor اصلی و RTL هم‌زمان نصب باشند، macOS ممکن است برخی
  لینک‌های `cursor://` را به برنامهٔ دیگر بدهد.
- **امضای ad-hoc:** بعد از پچ، امضای Developer ID اصلی معتبر نیست. برنامه
  با امضای ad-hoc و حفظ entitlements ساخته می‌شود. اگر macOS مانع اجرا شد،
  از راست‌کلیک → Open استفاده کنید.
- **آپدیت خودکار:** `updateUrl` و `backupUpdateUrl` در `product.json` خالی
  شده‌اند. دکمهٔ بررسی دستی آپدیت کار نمی‌کند؛ آپدیت را از Cursor اصلی
  انجام دهید و دوباره build کنید.
- **دامنهٔ RTL:** منو/سایدبار/تنظیمات و عنوان‌های تاریخچه عمداً تغییر
  نمی‌کنند. فایل‌های کد در Monaco همیشه LTR می‌مانند.
- **وب‌ویوها:** اگر Cursor برای بخشی از پیش‌نمایش از webview جدا استفاده
  کند، آن محتوا ممکن است داخل DOM اصلی نباشد و پوشش نگیرد. چت/ایجنت و
  Markdown داخل DOM اصلی پوشش داده می‌شوند.

## ۱۰) فایل‌ها

```text
harnesses/cursor/
  README.md
  patch-cursor-rtl.sh
  rtl-fa.css
  rtl-fa.js
  vazirmatn-regular.woff2
  vazirmatn-medium.woff2
  vazirmatn-bold.woff2
  OFL.txt
  tests/rtl.test.mjs
```

## ۱۱) مرجع

- `/Applications/Cursor.app` — نسخهٔ مبدأ.
- `workbench.html` در
  `Contents/Resources/app/out/vs/code/electron-sandbox/workbench/`.
- `product.json` برای چک‌سام `workbench.html` و تنظیمات آپدیت.
- الگوی پاراگراف‌محور Qoder و WorkBuddy در همین مخزن.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

# راستی‌آزمایی — روش و نتایج واقعی

## ۰) سه سطح بررسی

| سطح | ابزار | چه چیزی ثابت می‌شود |
| --- | --- | --- |
| ایستا | `node patches/scripts/verify-asar.mjs` | یکپارچگی asar، هش plist، وجود تزریق‌ها |
| اجرا (پروسه) | `KIMI_RTL_DEBUG=1 "<app>/Contents/MacOS/Kimi" > /tmp/kimi-rtl-run.log 2>&1 &` | اپ بدون FATAL بالا می‌آید، preloadها اجرا می‌شوند |
| اجرا (DOM) | گزارش تشخیصی خود bootstrap | فونت و جهت‌دهی واقعاً روی DOM اثر گذاشته‌اند |

## ۱) بازبینی ایستا

```
$ node patches/scripts/verify-asar.mjs "/Applications/Kimi RTL.app"

بازبینی: /Applications/Kimi RTL.app

[1] هش هدر asar
  ✅ هدر مطابق plist (d14c6dd99ddbf76f…)
[2] integrity فایل‌های داخل asar
  ✅ 902 فایل بررسی شد
  ✅ همهٔ فایل‌ها بلوک integrity دارند
  ✅ همهٔ hash/blockها درست هستند
  ✅ فایل‌های unpacked در app.asar.unpacked موجودند
[3] تزریق‌های پچ
  ✅ out/main/index.js → bootstrap تزریق شده
  ✅ kimi-rtl/rtl-main-bootstrap.mjs موجود است
  ✅ kimi-rtl/rtl-preload.cjs موجود است
  ✅ kimi-rtl/rtl-preload.mjs موجود است
  ✅ kimi-rtl/rtl-autodir.js موجود است
  ✅ kimi-rtl/rtl-inline.css موجود است
  ✅ 10 preload اپ تزریق شده
  ✅ auto-updater غیرفعال شده

نتیجه: همهٔ بازبینی‌ها موفق ✅
```

## ۲) خروجی گزارش تشخیصی زمان اجرا

```
$ KIMI_RTL_DEBUG=1 "/Applications/Kimi RTL.app/Contents/MacOS/Kimi" > /tmp/kimi-rtl-run.log 2>&1 &
$ grep -E "Kimi-RTL" /tmp/kimi-rtl-run.log
```

```
[Kimi-RTL] bootstrap loaded
[Kimi-RTL] registerPreloadScript ok (session-created)
[Kimi-RTL] scripts(session-created): [{"filePath":"…/app.asar/kimi-rtl/rtl-preload.cjs","id":"kimi-rtl-preload","type":"frame"}]
[Kimi-RTL] registerPreloadScript ok (session-created)
[Kimi-RTL] dom-ready: app://localhost/launcher.html?…            → preload-marker=true
[Kimi-RTL] dom-ready: app://localhost/volcano-tracker.html?…     → preload-marker=true
[Kimi-RTL] dom-ready: app://localhost/kimi-agent.html?…          → preload-marker=true
[Kimi-RTL] dom-ready: https://www.kimi.ai/                       → preload-marker=true
```

نکته: در حالت سالم، لایهٔ اطمینان **اجرا نمی‌شود** (`preload-marker=true` یعنی
preload کار خود را کرده). در نسخه‌های قبل از رفع مشکل، همین خطوط
`preload-marker=false` و سپس `fallback injection → …` بود.

### گزارش DOM (۸ ثانیه پس از dom-ready)

| صفحه | مسیر تزریق | `.kimi-rtl-auto` | `dir=rtl` | Vazirmatn لود شده | آزمون زنده |
| --- | --- | --- | --- | --- | --- |
| `app://localhost/launcher.html` | `cjs+mjs` | ۰ | ۰ | ✅ | `dir=rtl` ✅ |
| `app://localhost/volcano-tracker.html` | `cjs` | ۰ | ۰ | ✅ | `dir=rtl` ✅ |
| `app://localhost/kimi-agent.html` | `cjs+mjs` | ۳۸ | ۰ | ✅ | `dir=rtl` ✅ |
| `https://www.kimi.ai/` | `cjs+mjs` | ۵۳ | **۱۶** | ✅ | `dir=rtl` ✅ |

- **`cjs+mjs`**: هر دو مسیر تزریق (session preload و preload خود اپ) اجرا شده‌اند.
- **`dir=rtl` در `www.kimi.ai`: ۱۶ عنصر** — یعنی روی محتوای فارسیِ واقعیِ چت
  جهت‌دهی انجام شده است (قبل از این، هیچ عنصری RTL نمی‌شد).
- **آزمون زنده**: یک `div` با متن `Run 123 test — سلام دنیای فارسی!` به صفحه
  اضافه می‌شود (متنی که با انگلیسی شروع شده و فارسی دارد). نتیجه در همهٔ صفحات:
  `testDir: "rtl"`, `testCls: true`, `testAlign: "start"` — دقیقاً همان چیزی که
  درخواست شده بود.

## ۳) سلامت باندل

```
$ codesign --verify --deep --strict "/Applications/Kimi RTL.app" && echo "signature OK"
signature OK

$ plutil -extract CFBundleName raw "/Applications/Kimi RTL.app/Contents/Info.plist"
Kimi RTL

$ ls "/Applications/Kimi RTL.app/Contents/Frameworks/" | grep -i helper
Kimi RTL Helper (GPU).app
Kimi RTL Helper (Plugin).app
Kimi RTL Helper (Renderer).app
Kimi RTL Helper.app
```

## ۴) بازتولید تست‌ها

```bash
# ۱) بازسازی کامل
./apply-patch.sh

# ۲) اجرا با گزارش
KIMI_RTL_DEBUG=1 "/Applications/Kimi RTL.app/Contents/MacOS/Kimi" > /tmp/kimi-rtl-run.log 2>&1 &
sleep 30
grep -E "Kimi-RTL (report|bootstrap|fallback)" /tmp/kimi-rtl-run.log

# ۳) انتظار: در همهٔ گزارش‌ها testDir="rtl" ، vazir=true ، و
#    در صفحهٔ چت rtl > 0 (اگر در حساب شما محتوای فارسی وجود داشته باشد).
```

### چک‌لیست پذیرش

- [ ] هیچ خطای `FATAL` در لاگ نباشد.
- [ ] `verify-asar.mjs` بدون خطا تمام شود.
- [ ] در گزارش‌ها `vazir: true` باشد.
- [ ] `testDir` در همهٔ صفحات `"rtl"` باشد.
- [ ] در صفحهٔ چت، `rtl` بزرگ‌تر از صفر باشد (وقتی پیام فارسی وجود دارد).
- [ ] تایپ یک جملهٔ فارسی در کامپوزر، جهت را به RTL ببرد (بازدید چشمی).

## ۵) آنچه هنوز دستی بررسی می‌شود

راستی‌آزمایی چشمی ظاهر نهایی (فاصله‌ها، فهرست‌های تودرتو، جدول‌ها، نقل‌قول‌ها،
و کدهای درون‌خطی در بندهای فارسی) نیازمند نگاه کاربر به پنجره است؛ ابزار
خودکار این پروژه فقط می‌تواند مشخص کند چه عناصری `dir` گرفته‌اند.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

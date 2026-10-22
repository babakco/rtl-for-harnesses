# Kimi RTL — ابزارهای Kimi (macOS)

این مخزن دو ابزار مستقل دارد:

| ابزار | کار |
| --- | --- |
| **پچ RTL** (فایل‌های ریشه + `patches/`) | کلون `Kimi RTL.app` با فونت Vazirmatn و راست‌چین‌سازی خودکار |
| `parity/README.md` | انتقال MCP سرورها و Agent Skillها از OpenCode به Kimi (CLI + Desktop) |

---

## ۱) پچ راست‌به‌چپ (`Kimi RTL.app`)

پچی که از روی **نسخهٔ اصلی و دست‌نخوردهٔ `Kimi.app`** یک کلون با نام
`Kimi RTL.app` می‌سازد و در آن:

1. **فونت Vazirmatn** را در کل رابط اعمال می‌کند (نسخهٔ متغیر + Regular + Bold،
   به‌صورت data-URI جاسازی‌شده تا مستقل از شبکه و مقاوم در برابر CSP باشد).
2. **جهت خودکار متن** را در همهٔ جمله‌ها و پاراگراف‌ها اعمال می‌کند:
   هر بلوکی که **حتی یک حرف فارسی/عربی** داشته باشد — حتی اگر با کلمات
   انگلیسی، عدد یا علائم شروع شده باشد — به‌صورت **RTL** نمایش داده می‌شود.
   این قاعده هم در **محل تایپ کاربر (composer)** و هم در **پاسخ‌های مدل** فعال است.
3. **auto-updater** را غیرفعال می‌کند تا نسخهٔ RTL با آپدیت نسخهٔ اصلی بازنویسی نشود.

نسخهٔ اصلی `Kimi.app` هیچ‌وقت تغییر نمی‌کند؛ همهٔ تغییرات روی کلون اعمال می‌شوند.

---

## شروع سریع

```bash
./apply-patch.sh                       # از /Applications/Kimi.app → «Kimi RTL.app»
open "/Applications/Kimi RTL.app"
```

بعد از هر **آپدیت Kimi**، کافی است دوباره همین دستور را اجرا کنید؛ پچر خروجی قبلی
را پاک و از روی نسخهٔ جدید بازسازی می‌کند (idempotent).

حذف کامل نسخهٔ RTL:

```bash
./restore.sh
```

نیازمندی: macOS + Node.js (فقط برای ساخت پچ؛ خودِ اپ به Node نیاز ندارد).

---

## گزینه‌ها و متغیرهای محیطی

| کار | دستور |
| --- | --- |
| ساخت از منبع/مقصد دلخواه | `./apply-patch.sh /path/Kimi.app "/Applications/Kimi RTL.app"` |
| فقط ساخت preload/CSS | `node patches/scripts/build-preload.cjs.js` |
| فقط پچ‌کردن | `node patches/scripts/patch-asar.mjs --src … --out …` |
| بازبینی یکپارچگی باندل | `node patches/scripts/verify-asar.mjs "/Applications/Kimi RTL.app"` |
| اجرا با گزارش تشخیصی | `KIMI_RTL_DEBUG=1 "/Applications/Kimi RTL.app/Contents/MacOS/Kimi"` |
| اجرا با پچ خاموش | `KIMI_RTL_DISABLE=1 "/Applications/Kimi RTL.app/Contents/MacOS/Kimi"` |

---

## ساختار پروژه

```
Kimi-RTL/
├── apply-patch.sh                 ← ساخت/بازسازی نسخهٔ RTL
├── restore.sh                     ← حذف نسخهٔ RTL
├── patches/
│   ├── rtl.css                    ← استایل RTL + @font-face
│   ├── rtl-autodir.js             ← منطق تشخیص جهت (فارسی ⇒ RTL)
│   ├── rtl-main-bootstrap.mjs     ← bootstrap فرایند main (تزریق در index.js)
│   ├── rtl-preload.cjs            ← ⚠️ تولیدشده (CJS)
│   ├── rtl-preload.mjs            ← ⚠️ تولیدشده (ESM)
│   ├── rtl-inline.css             ← ⚠️ تولیدشده (CSS با فونت data-URI)
│   ├── assets/                    ← Vazirmatn Regular/Bold/Variable + OFL.txt
│   └── scripts/
│       ├── build-preload.cjs.js   ← تولید preload/CSS
│       ├── patch-asar.mjs         ← هستهٔ پچر (جراحی asar + plist + codesign)
│       └── verify-asar.mjs        ← بازبینی یکپارچگی
├── docs/                          ← مستندات دانشی
└── research/                      ← شواهد و ارجاع‌های فنی خام
```

> فایل‌های علامت‌خورده با ⚠️ **تولیدشده** هستند؛ به‌جای ویرایش دستی،
> `build-preload.cjs.js` را دوباره اجرا کنید.

---

## مستندات

| سند | محتوا |
| --- | --- |
| [docs/01-architecture.md](01-architecture.md) | معماری پچ و مسیر اجرای کد در زمان اجرا |
| [docs/02-technical-notes.md](02-technical-notes.md) | جزئیات فنی: فرمت asar، هش integrity، نام‌گذاری helper، plist، کدساین |
| [docs/03-work-report.md](03-work-report.md) | گزارش کارهای انجام‌شده و خطاهای رفع‌شده |
| [docs/04-verification.md](04-verification.md) | روش و نتیجهٔ راستی‌آزمایی (خروجی واقعی) |
| [docs/05-troubleshooting.md](05-troubleshooting.md) | عیب‌یابی و پرسش‌های رایج |
| [research/electron-sources.md](../research/electron-sources.md) | ارجاع‌های دقیق به سورس Electron v43.7.3 و شواهد استخراج‌شده |
| `parity/README.md` | همگام‌سازی MCP و Skillها از OpenCode به Kimi |

---

## محدودیت‌های شناخته‌شده

- **کد و فرمول و نمودار** از جهت‌دهی مستثنا هستند (فونت مونو‌اسپیس و جهت اصلی حفظ می‌شود).
- پچ بعد از هر **آپدیت Kimi** باید دوباره اجرا شود (این طراحی است، نه نقص).
- اپ پچ‌شده با امضای **ad-hoc** امضا می‌شود؛ macOS ممکن است بار اول هشدار
  Gatekeeper نشان دهد (اجرای دوباره کافی است).
- اپ اصل و پچ‌شده **پروفایل کاربری مشترک** دارند (`~/Library/Application Support/kimi-desktop`)،
  پس ورود/تاریخچه مشترک است. اجرای هم‌زمان هر دو اپ توصیه نمی‌شود.
- قاعدهٔ جهت‌دهی «وجود حرف فارسی ⇒ RTL» است؛ بنابراین یک پاراگراف غالباً انگلیسی
  که یک واژهٔ فارسی دارد نیز راست‌چین می‌شود. این دقیقاً همان رفتاری است که
  درخواست شده است (به [docs/02-technical-notes.md](02-technical-notes.md) مراجعه کنید).

---

## ۲) parity — MCP و Skillها در Kimi

تمام MCP سرورهای **فعال** OpenCode و همهٔ Agent Skillهایی که OpenCode می‌بیند،
در **Kimi Code CLI** و **Kimi Desktop** هم در دسترس می‌شوند.

```bash
./sync-to-kimi.sh              # نمایش تغییرات (dry-run)
./sync-to-kimi.sh --apply      # اعمال، با پشتیبان‌گیری خودکار
./sync-to-kimi.sh --list       # وضعیت فعلی
```

جزئیات، جدول نگاشت و عیب‌یابی: `parity/README.md`
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

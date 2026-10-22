# کارت مرور سریع — بروزرسانی و اعمال مجدد پچ RTL

> راهنمای کامل: `README.md` در همین فولدر.

---

## «پچ کن» = یک دستور (روش استاندارد)

- **اصل**: `/Applications/Claude.app` — امضای Anthropic، آپدیت خودکار کار می‌کند.
- **نسخهٔ RTL**: `~/Applications/Claude-RTL.app` — کپی از اصل + پچ.
- **میانبر**: `/Applications/Claude RTL.app` → نسخهٔ RTL.

بعد از هر بروزرسانی Claude (یا هر وقت گفتید «پچ کن»):

```bash
cd harnesses/claude-desktop
./patch-live.sh --make-rtl --font Vazirmatn
```

این دستور **نسخهٔ RTL قبلی را با کپیِ تازه از اصلِ آپدیت‌شده جایگزین و پچ می‌کند**
→ نسخهٔ RTL همیشه بروزترین است.

> ⚠️ هر دو اپ bundle id مشترک دارند — همزمان باز نکنید.

---

## گردش کار بروزرسانی (بعد از هر نسخهٔ جدید Claude)

> ⚠️ آپدیت خودکار روی نسخهٔ **اصلی** (Anthropic-sign) نصب می‌شود. اگر لازم بود
> نسخهٔ جدید را **دستی** نصب کنید:

### ۱) دانلود و نصب نسخهٔ جدید (روی اصل)
```bash
open https://claude.ai/download
```
- فایل `.dmg` را دانلود و باز کنید
- اپ را روی `/Applications` درگ کنید (نسخهٔ اصلی جایگزین می‌شود)

### ۲) «پچ کن» — ساخت/تازه‌سازی نسخهٔ RTL
```bash
cd harnesses/claude-desktop
./patch-live.sh --make-rtl --font Vazirmatn
```

### ۳) اگر لازم بود
- صفحهٔ سفید (یک‌باره) → اپ را ببندید و دوباره باز کنید
- تب Code فعال نبود / فقط مدل‌های رسمی → **Sign out → Sign in**
- دکمه‌ها خالی بودند (مشکل پچ قدیمی با فونت سراسری) → با `--force` دوباره اعمال کنید

---

## بررسی وضعیت

```bash
./patch-live.sh --status
```

مطلوب:
```
Claude.app: installed (1.xx)          ← اصل (بدون پچ)
[!] RTL patch: not applied            ← اصل پچ نشده (درست است)
RTL copy (~/Applications/Claude-RTL.app): version 1.xx
  [+] patched                         ← نسخهٔ RTL پچ شده (درست است)
```

---

## بازگردانی نسخهٔ اصلی (اگر لازم شد)

```bash
./patch-live.sh --restore
```

> بکاپ روی نسخهٔ اولین `--install` ثابت می‌ماند؛ پس از آپدیت‌های خودکار، `--restore` ممکن است اپ را downgrade کند—در گردش‌کار دو‌نسخه‌ای ترجیحاً دوباره `--make-rtl` را اجرا کنید، نه `--restore`.

---

## یادآوری‌ها

- بکاپ: `~/Applications/Claude.app.pre-rtl-backup`
- فونت فقط روی **متن** اعمال می‌شود؛ دکمه‌ها و آیکون‌ها ظاهر اصلی را حفظ می‌کنند.
- چت اصلی همیشه از مدل‌های رسمی Anthropic است — مدل‌های محلی فقط در **تب Code**.
- اگر خودِ اسکریپت را تغییر دادید و اپ پچ قبلی دارد: `--force` اضافه کنید.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../../AUTHORS.md)

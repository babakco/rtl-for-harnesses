# MiniMax Code-RTL — پچ راست‌به‌چپ و فونت فارسی (macOS)

این مخزن یک **پچ تکرارپذیر (idempotent)** است که از روی نسخهٔ نصب‌شده و
**دست‌نخوردهٔ** `MiniMax Code.app` یک کلون با نام **`MiniMax Code-RTL.app`**
می‌سازد و در آن:

1. **فونت Vazirmatn** را روی کل رابط، محل تایپ کاربر و پاسخ‌های مدل اعمال می‌کند.
2. **جهت خودکار متن** را اعمال می‌کند: هر پاراگراف / جمله / بلوک متنی که
   **حتی یک حرف فارسی** داشته باشد — حتی اگر با کلمهٔ انگلیسی، عدد یا علامت
   شروع شده باشد — به‌صورت **RTL** نمایش داده می‌شود.
3. این قاعده را روی **همهٔ فایل‌های بازشده در نرم‌افزار** و **توضیحات
   پرسش‌های چندگزینه‌ای** هم اعمال می‌کند.
4. **auto-updater** و **hot-update** را غیرفعال می‌کند تا نسخهٔ RTL با
   آپدیت نسخهٔ اصلی بازنویسی نشود.
5. `userData` را از نسخهٔ اصلی جدا می‌کند تا هر دو نسخه بتوانند هم‌زمان
   اجرا شوند (بدون تداخل قفل تک‌نمونه‌ای).

نسخهٔ اصلی `MiniMax Code.app` **هیچ‌وقت تغییر نمی‌کند**؛ همهٔ تغییرات روی کلون
اعمال می‌شود.

---

## شروع سریع

```bash
cd harnesses/minimax-code
./apply-patch.sh                       # از /Applications/MiniMax Code.app
open "/Applications/MiniMax Code-RTL.app"
```

بعد از هر **آپدیت MiniMax Code**، کافی است دوباره همین دستور را اجرا کنید؛
پچر خروجی قبلی را پاک و از روی نسخهٔ جدید بازسازی می‌کند.
جزئیات: [`docs/06-update-playbook.md`](06-update-playbook.md)

حذف کامل نسخهٔ RTL:

```bash
./restore.sh
```

---

## ساختار مخزن

| مسیر | کار |
| --- | --- |
| `apply-patch.sh` | نقطهٔ ورود: ساخت آرتیفکت‌ها → کلون و پچ → بازبینی |
| `restore.sh` | حذف نسخهٔ RTL |
| `patches/rtl.css` | استایل پچ: فونت Vazirmatn + قواعد جهت (منبع حقیقت) |
| `patches/rtl-autodir.js` | منطق تشخیص خودکار جهت (منبع حقیقت) |
| `patches/rtl-inline.css` | *تولیدشده* — `rtl.css` با فونت‌های data-URI |
| `patches/rtl-preload.cjs` | *تولیدشده* — قلاب preload |
| `patches/assets/` | فونت Vazirmatn (Regular / Bold / Variable) + مجوز OFL |
| `patches/scripts/build-preload.cjs.js` | تولید فایل‌های بالا |
| `patches/scripts/patch-asar.mjs` | هستهٔ پچ (جراحی asar + plist + امضا) |
| `patches/scripts/verify-asar.mjs` | بازبینی یکپارچگی خروجی |
| `tests/fixture.html` | تست DOM جهت‌دهی (۲۱ سنجه) |
| `docs/` | راهنماهای پروژه — معماری، جزئیات فنی، گزارش کار، بازبینی، اشکال‌زدایی |

---

## مستندات

| سند | محتوا |
| --- | --- |
| [01-architecture.md](01-architecture.md) | معماری MiniMax Code و معماری پچ |
| [02-technical-notes.md](02-technical-notes.md) | جزئیات فنی: asar، integrity، CSP، fuse، فونت |
| [03-work-report.md](03-work-report.md) | گزارش کار، تصمیم‌ها و دانش به‌دست‌آمده |
| [04-verification.md](04-verification.md) | روش‌های بازبینی و نتایج تست |
| [05-troubleshooting.md](05-troubleshooting.md) | اشکال‌زدایی مشکلات رایج |
| [06-update-playbook.md](06-update-playbook.md) | راهنمای به‌روزرسانی پس از آپدیت اپ |

---

## نسخهٔ هدف

| مورد | مقدار |
| --- | --- |
| اپ | MiniMax Code 3.1.4 (`com.minimax.agent`) |
| Electron | 42.8.0 (Chromium 148.0.7778.280) |
| پلتفرم | macOS (arm64) |
| رندرر | Next.js static export در `out/`، سروشده با پروتکل `app://` |
| تاریخ ساخت پچ | 2026-10-20 |

پچ در برابر نسخه‌های جدیدتر هم تا حد زیادی مقاوم است (به‌صورت **کشف‌پویا** کار
می‌کند)، ولی بعد از هر آپدیت باید اجرا و بازبینی شود — راهنمای آن در
[`docs/06-update-playbook.md`](06-update-playbook.md) است.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

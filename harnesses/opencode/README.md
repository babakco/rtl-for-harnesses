# OpenCode

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **OpenCode** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/OpenCode.app`
- خروجی RTL: `/Applications/OpenCode-RTL.app`
- روش: `electron-asar`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 2.0.32؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `node`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build opencode --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/opencode
node apply-rtl-patch.mjs --rtl-app /Applications/OpenCode-RTL.app
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build opencode --dry-run
```

## تأیید

```bash
./rtl-harness verify opencode
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`ai.opencode.desktop`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/OpenCode-RTL.app/Contents/Info.plist"
```

## تست

این هارنس در مخزن تست خودکار ندارد. تست اصلی در پروژهٔ منبع انجام شده است؛ برای بررسی سریع از `./rtl-harness verify` استفاده کنید.

## اجرا

```bash
open "/Applications/OpenCode-RTL.app"
```

## بازگردانی / حذف

برای حذف، `OpenCode-RTL.app` را به سطل زباله ببرید. برنامهٔ اصلی و پروفایل آن دست نخورده‌اند. RTL-2 در این مخزن ساخته نمی‌شود.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

فقط `OpenCode-RTL.app` ساخته می‌شود. کد `RTL-2` در پوشه باقی مانده اما به‌طور پیش‌فرض build نمی‌شود. هرگز اسکریپت را بدون `--rtl-app` اجرا نکنید؛ حالت no-flag برنامهٔ اصلی را درجا پچ می‌کند. `--update` را در build پیش‌فرض استفاده نکنید (شبکه).

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `apply-rtl-patch.mjs` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

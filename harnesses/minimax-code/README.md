# MiniMax Code

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **MiniMax Code** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/MiniMax Code.app`
- خروجی RTL: `/Applications/MiniMax Code-RTL.app`
- روش: `electron-asar-preload`
- پروفایل: `جدا (اجرای هم‌زمان مجاز است)`
- وضعیت در این مخزن: نسخهٔ مستند: 3.1.4؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `node`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build minimax-code --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/minimax-code
bash apply-patch.sh
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build minimax-code --dry-run
```

## تأیید

```bash
./rtl-harness verify minimax-code
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`com.minimax.agent`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/MiniMax Code-RTL.app/Contents/Info.plist"
```

## تست

این هارنس در مخزن تست خودکار ندارد. تست اصلی در پروژهٔ منبع انجام شده است؛ برای بررسی سریع از `./rtl-harness verify` استفاده کنید.

## اجرا

```bash
open "/Applications/MiniMax Code-RTL.app"
```

## بازگردانی / حذف

```bash
cd harnesses/minimax-code
bash restore.sh
```

سپس در صورت نیاز خروجی RTL را به سطل زباله ببرید.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

پروفایل و bundle ID این نسخه جدا است؛ می‌توانید هم‌زمان با نسخهٔ اصلی اجرا کنید. `restore.sh` نسخهٔ RTL و داده‌های کنار آن را برمی‌گرداند.



## فایل‌ها

- `apply-patch.sh` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

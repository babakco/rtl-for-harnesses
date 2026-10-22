# Freebuff

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **Freebuff** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/Freebuff.app`
- خروجی RTL: `/Applications/Freebuff-RTL.app`
- روش: `electron-asar`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 0.0.184؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `node`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build freebuff --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/freebuff
bash patch/patch.sh
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build freebuff --dry-run
```

## تأیید

```bash
./rtl-harness verify freebuff
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`com.freebuff.desktop.rtl`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/Freebuff-RTL.app/Contents/Info.plist"
```

## تست

```bash
./rtl-harness test freebuff
```

## اجرا

```bash
open "/Applications/Freebuff-RTL.app"
```

## بازگردانی / حذف

برنامهٔ اصلی دست نخورده است. برای بازگردانی، فقط خروجی RTL را به سطل زباله ببرید: `/Applications/Freebuff-RTL.app`.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

پروفایل `~/Library/Application Support/Freebuff` مشترک است؛ فقط یکی از دو برنامه را اجرا کنید. `--in-place` یک حالت legacy است و در این مخزن پیش‌فرض نیست.

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `patch/patch.sh` — نقطهٔ ورود
- `docs/reference.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.md`](docs/reference.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

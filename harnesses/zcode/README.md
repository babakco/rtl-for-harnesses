# ZCode

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **ZCode** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/ZCode.app`
- خروجی RTL: `/Applications/ZCode-RTL.app`
- روش: `electron-asar`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 3.16.2؛ آخرین تأیید در این مخزن: 3.16.2 (build و verify در حالت کپی)

## پیش‌نیازها

ابزارهای لازم: `node`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build zcode --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/zcode
node bin/zcode-rtl-patch.mjs
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build zcode --dry-run
```

## تأیید

```bash
./rtl-harness verify zcode
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`dev.zcode.app.rtl`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/ZCode-RTL.app/Contents/Info.plist"
```

## تست

```bash
./rtl-harness test zcode
```

## اجرا

```bash
open "/Applications/ZCode-RTL.app"
```

## بازگردانی / حذف

برنامهٔ اصلی دست نخورده است. برای بازگردانی، فقط خروجی RTL را به سطل زباله ببرید: `/Applications/ZCode-RTL.app`.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

bundle ID به `dev.zcode.app.rtl` تغییر می‌کند اما userData مشترک است؛ هم‌زمان با ZCode اصلی اجرا نکنید. اسکریپت `--dry-run` و `--inspect` هم دارد و خروجی build را در `build/` نگه می‌دارد.

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `bin/zcode-rtl-patch.mjs` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

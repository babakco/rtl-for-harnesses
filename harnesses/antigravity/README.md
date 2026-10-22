# Google Antigravity

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **Google Antigravity** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/Antigravity.app`
- خروجی RTL: `/Applications/Antigravity RTL.app`
- روش: `electron-asar-preload`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 2.22.0؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `node`، `npx`، `python3`، `rsync`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build antigravity --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/antigravity
bash tools/apply-rtl-patch.sh --no-launch
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build antigravity --dry-run
```

## تأیید

```bash
./rtl-harness verify antigravity
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`com.google.antigravity.rtl`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/Antigravity RTL.app/Contents/Info.plist"
```

## تست

```bash
./rtl-harness test antigravity
```

## اجرا

```bash
open "/Applications/Antigravity RTL.app"
```

## بازگردانی / حذف

برنامهٔ اصلی دست نخورده است. برای بازگردانی، فقط خروجی RTL را به سطل زباله ببرید: `/Applications/Antigravity RTL.app`.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

پروفایل Antigravity مشترک است؛ هم‌زمان اجرا نکنید. پچ به‌صورت preload hook + CSS عمل می‌کند و کد/ترمینال/فرمول را LTR نگه می‌دارد.

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `tools/apply-rtl-patch.sh` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

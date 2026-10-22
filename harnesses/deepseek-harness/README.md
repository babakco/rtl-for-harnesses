# DeepSeek Harness

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **DeepSeek Harness** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/DeepSeek Harness.app`
- خروجی RTL: `/Applications/DeepSeek Harness-RTL.app`
- روش: `electron-asar`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 0.2.1-rc.2؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `node`، `python3`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build deepseek-harness --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/deepseek-harness
bash patch-dsh-rtl.sh
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build deepseek-harness --dry-run
```

## تأیید

```bash
./rtl-harness verify deepseek-harness
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`com.deepseek.dsh.rtl`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/DeepSeek Harness-RTL.app/Contents/Info.plist"
```

## تست

این هارنس در مخزن تست خودکار ندارد. تست اصلی در پروژهٔ منبع انجام شده است؛ برای بررسی سریع از `./rtl-harness verify` استفاده کنید.

## اجرا

```bash
open "/Applications/DeepSeek Harness-RTL.app"
```

## بازگردانی / حذف

برنامهٔ اصلی دست نخورده است. برای بازگردانی، فقط خروجی RTL را به سطل زباله ببرید: `/Applications/DeepSeek Harness-RTL.app`.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

این پچ از `~/.dsh` مشترک استفاده می‌کند؛ قبل از اجرای نسخهٔ RTL، نسخهٔ اصلی را ببندید. اسکریپت هر بار از نسخهٔ اصلی بازسازی می‌کند و self-updater را در نسخهٔ RTL خاموش می‌کند.

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `patch-dsh-rtl.sh` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

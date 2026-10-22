# Claude Desktop

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **Claude Desktop** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/Claude.app`
- خروجی RTL: `$HOME/Applications/Claude-RTL.app`
- روش: `electron-asar`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 3.1623.0؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `node`، `npx`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build claude-desktop --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/claude-desktop
bash patch-live.sh --make-rtl
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build claude-desktop --dry-run
```

## تأیید

```bash
./rtl-harness verify claude-desktop
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`com.anthropic.claudefordesktop`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "$HOME/Applications/Claude-RTL.app/Contents/Info.plist"
```

## تست

این هارنس در مخزن تست خودکار ندارد. تست اصلی در پروژهٔ منبع انجام شده است؛ برای بررسی سریع از `./rtl-harness verify` استفاده کنید.

## اجرا

```bash
open "$HOME/Applications/Claude-RTL.app"
```

## بازگردانی / حذف

برای حذف کپی، `$HOME/Applications/Claude-RTL.app` را به سطل زباله ببرید. اگر قبلاً `--install` را اجرا کرده‌اید، `bash patch-live.sh --restore` را از پوشهٔ هارنس اجرا کنید.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

حالت پیش‌فرض `--make-rtl` است و یک کپی در `$HOME/Applications/Claude-RTL.app` می‌سازد. `--install` برنامهٔ `/Applications/Claude.app` را درجا پچ می‌کند و پیش‌فرض نیست. پروفایل Claude مشترک است؛ هم‌زمان اجرا نکنید.

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `patch-live.sh` — نقطهٔ ورود
- `docs/reference.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.md`](docs/reference.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

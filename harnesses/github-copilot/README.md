# GitHub Copilot

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را با تزریق dylib به **GitHub Copilot** اعمال می‌کند. این تنها هارنس درجا در مخزن است.

- برنامهٔ اصلی: `/Applications/GitHub Copilot.app`
- خروجی RTL: `/Applications/GitHub Copilot.app`
- روش: `webkit-dylib`
- پروفایل: `درجا؛ همان برنامهٔ اصلی`
- وضعیت در این مخزن: نسخهٔ مستند: 1.1.15؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `clang`، `ditto`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است. برای اجرای dylib همراه، macOS arm64 لازم است.

## ساخت

**این هارنس درجا پچ می‌کند.** فقط پس از خواندن `docs/safety.md`، بستن برنامه و تأیید وجود پشتیبان، `--allow-in-place` را اضافه کنید. `patch.sh` پشتیبان را **قبل از تزریق** در `$HOME/CopilotRTLBackup/GitHub Copilot.app` می‌سازد؛ بعد از شروع build وجود آن را بررسی کنید.

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build github-copilot --yes --allow-in-place
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/github-copilot
bash patch.sh
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build github-copilot --dry-run
```

## تأیید

```bash
./rtl-harness verify github-copilot
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`com.github.githubapp`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/GitHub Copilot.app/Contents/Info.plist"
```

## تست

این هارنس در مخزن تست خودکار ندارد. تست اصلی در پروژهٔ منبع انجام شده است؛ برای بررسی سریع از `./rtl-harness verify` استفاده کنید.

## اجرا

```bash
open "/Applications/GitHub Copilot.app"
```

## بازگردانی / حذف

```bash
cd harnesses/github-copilot
bash uninstall.sh
```

سپس در صورت نیاز خروجی RTL را به سطل زباله ببرید.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

**درجا پچ می‌کند.** فقط پس از پشتیبان‌گیری و با `--allow-in-place` اجرا کنید. پشتیبان یک‌باره در `$HOME/CopilotRTLBackup/GitHub Copilot.app` ساخته می‌شود. dylib همراه arm64 است؛ Intel Mac باید با `build.sh` بازسازی کند.



## فایل‌ها

- `patch.sh` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

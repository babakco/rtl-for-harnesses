# Codex (ChatGPT desktop)

## این هارنس چه می‌کند

پچ راست‌چین فارسی و فونت وزیرمتن را برای **Codex (ChatGPT desktop)** اعمال می‌کند. کد، ترمینال و فرمول‌ها در حالت LTR می‌مانند و متن فارسی/عربی RTL می‌شود.

- برنامهٔ اصلی: `/Applications/ChatGPT.app`
- خروجی RTL: `$HOME/Applications/ChatGPT-RTL.app`
- روش: `electron-asar-framework`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 26.1007.30912؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `node`، `npx`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build codex --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/codex
bash patch-codex-rtl.sh --make-rtl
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build codex --dry-run
```

## تأیید

```bash
./rtl-harness verify codex
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`com.openai.codex`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "$HOME/Applications/ChatGPT-RTL.app/Contents/Info.plist"
```

## تست

```bash
./rtl-harness test codex
```

## اجرا

```bash
open "$HOME/Applications/ChatGPT-RTL.app"
```

## بازگردانی / حذف

برنامهٔ اصلی دست نخورده است. برای بازگردانی، فقط خروجی RTL را به سطل زباله ببرید: `$HOME/Applications/ChatGPT-RTL.app`.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

خروجی در `$HOME/Applications/ChatGPT-RTL.app` ساخته می‌شود و پروفایل `com.openai.codex` مشترک است. اسکریپت framework integrity، entitlements و امضای ad-hoc را بازسازی می‌کند؛ بعد از هر آپدیت ChatGPT دوباره اجرا شود.

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `patch-codex-rtl.sh` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

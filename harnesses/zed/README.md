# Zed

## این هارنس چه می‌کند

Zed را از سورس Rust با پچ‌های RTL فارسی و فونت وزیرمتن می‌سازد. کلون نسخهٔ نصب‌شده فقط یک fallback ظاهری است.

- برنامهٔ اصلی: `/Applications/Zed.app`
- خروجی RTL: `/Applications/Zed-RTL.app`
- روش: `native-source-rust`
- پروفایل: `مشترک با برنامهٔ اصلی (هم‌زمان اجرا نکنید)`
- وضعیت در این مخزن: نسخهٔ مستند: 1.18.1؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `cargo`، `rustc`، `git`، `xcodebuild`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build zed --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/zed
bash scripts/build-zed-rtl.sh
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build zed --dry-run
```

## تأیید

```bash
./rtl-harness verify zed
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`dev.zed.Zed-RTL`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "/Applications/Zed-RTL.app/Contents/Info.plist"
```

## تست

```bash
./rtl-harness test zed
```

## اجرا

```bash
open "/Applications/Zed-RTL.app"
```

## بازگردانی / حذف

برنامهٔ اصلی دست نخورده است. برای بازگردانی، فقط خروجی RTL را به سطل زباله ببرید: `/Applications/Zed-RTL.app`.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

ساخت اصلی از سورس Rust است و به `cargo`، `rustc`، `xcodebuild` و Xcode CLT نیاز دارد. کلون نسخهٔ نصب‌شده (`make-rtl-app-from-installed.sh`) فقط فونت/هویت را عوض می‌کند و RTL واقعی نیست؛ از آن به‌عنوان fallback استفاده نکنید.

**پروفایل مشترک:** هم‌زمان با برنامهٔ اصلی اجرا نکنید؛ دو instance می‌توانند داده یا قفل فایل را خراب کنند.

## فایل‌ها

- `scripts/build-zed-rtl.sh` — نقطهٔ ورود
- `docs/reference.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/reference.fa.md`](docs/reference.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

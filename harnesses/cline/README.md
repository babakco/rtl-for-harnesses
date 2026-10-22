# Cline

## این هارنس چه می‌کند

Cline را از سورس Tauri با patch راست‌چین فارسی و فونت وزیرمتن می‌سازد.

- برنامهٔ اصلی: `/Applications/Cline.app`
- خروجی RTL: `$HOME/Applications/Cline RTL.app`
- روش: `tauri-source`
- پروفایل: `جدا (اجرای هم‌زمان مجاز است)`
- وضعیت در این مخزن: نسخهٔ مستند: 0.0.45؛ آخرین تأیید در این مخزن: هنوز انجام نشده

## پیش‌نیازها

ابزارهای لازم: `bun`، `cargo`، `rustc`، `git`، `xcodebuild`، `curl`، `codesign`، `plutil`. macOS و Node.js 18+ برای CLI لازم است. شبکهٔ اینترنت برای دریافت سورس Cline لازم است.

## ساخت

روش پیشنهادی (همان کاری که CLI انجام می‌دهد):

```bash
./rtl-harness build cline --yes
```

اجرای مستقیم اسکریپت از ریشهٔ مخزن:

```bash
cd harnesses/cline
bash build-rtl.sh --from-installed
```

اگر می‌خواهید فقط برنامه و دستور را ببینید و هیچ فایلی تغییر نکند:

```bash
./rtl-harness build cline --dry-run
```

## تأیید

```bash
./rtl-harness verify cline
```

این دستور وجود خروجی، `CFBundleIdentifier` مورد انتظار (`bot.cline.app.rtl`)، امضای ad-hoc و تست نحوی/تست خود هارنس را بررسی می‌کند. برای بررسی دستی نسخه:

```bash
plutil -extract CFBundleShortVersionString raw -o - "$HOME/Applications/Cline RTL.app/Contents/Info.plist"
```

## تست

این هارنس در مخزن تست خودکار ندارد. تست اصلی در پروژهٔ منبع انجام شده است؛ برای بررسی سریع از `./rtl-harness verify` استفاده کنید.

## اجرا

```bash
open "$HOME/Applications/Cline RTL.app"
```

## بازگردانی / حذف

برنامهٔ اصلی دست نخورده است. برای بازگردانی، فقط خروجی RTL را به سطل زباله ببرید: `$HOME/Applications/Cline RTL.app`.

## بعد از آپدیت برنامهٔ اصلی

برنامهٔ اصلی را به‌روزرسانی کنید، آن را ببندید و همان دستور ساخت را دوباره اجرا کنید. پچ‌ها از نسخهٔ اصلی بازسازی می‌شوند تا نسخهٔ قدیمی روی نسخهٔ جدید باقی نماند. اگر اسکریپت نسخه را رد کرد، `testedVersion` و README همین هارنس را بررسی کنید.

## هشدارها

این هارنس از سورس Tauri build می‌شود و به شبکه، Bun، Rust و Xcode CLT نیاز دارد. خروجی در `$HOME/Applications/Cline RTL.app` است. patch فعلی برای 0.0.45 تهیه شده؛ اگر نسخهٔ نصب‌شده جدیدتر است، `--from-installed` نسخهٔ متناظر را انتخاب می‌کند اما ممکن است patch نیاز به به‌روزرسانی داشته باشد.



## فایل‌ها

- `build-rtl.sh` — نقطهٔ ورود
- `docs/agent-notes.fa.md` — مستندات اصلی (پاکسازی‌شده)
- `README.md` — همین راهنما

## مرجع

- [`docs/safety.md`](../../docs/safety.md)
- [`docs/updating.md`](../../docs/updating.md)
- [`docs/troubleshooting.md`](../../docs/troubleshooting.md)
- [`docs/agent-notes.fa.md`](docs/agent-notes.fa.md)

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../AUTHORS.md)

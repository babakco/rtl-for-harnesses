# قرارداد عامل (AGENTS.md)

این فایل برای ایجنت‌های کدنویسی است که می‌خواهند یکی از هارنس‌های این مخزن را
بسازند یا بررسی کنند. متن فارسی است؛ دستورها، مسیرها و کلیدهای JSON به لاتین
می‌مانند.

## ترتیب مطالعهٔ اجباری

1. همین فایل.
2. `manifest.json` — تنها منبع حقیقت برای slug، مسیرها، پروفایل و دستورها.
3. `harnesses/<slug>/README.md` — هشدارهای مخصوص همان هارنس.
4. `docs/safety.md` و در صورت نیاز `docs/troubleshooting.md`.

اگر تعارضی بین README و manifest دیدید، **manifest** را مبنا بگیرید و تعارض را
گزارش کنید؛ خودسرانه دستور را عوض نکنید.

## قواعد سخت

- **هیچ‌وقت** منبع اصلی را در `$HOME/OpenCode/<project>` تغییر ندهید. فقط از
  روی آن کپی کنید.
- حالت پیش‌فرض **copy mode** است. فقط `github-copilot` درجا است و بدون
  `--allow-in-place` و تأیید صریح کاربر اجرا نمی‌شود.
- OpenCode را **هرگز** بدون `--rtl-app` اجرا نکنید. حالت no-flag برنامهٔ
  `/Applications/OpenCode.app` را درجا پچ می‌کند.
- `--update` را در build پیش‌فرض OpenCode اضافه نکنید؛ شبکه و تغییر نسخه
  می‌خواهد.
- Zed را از سورس Rust بسازید (`scripts/build-zed-rtl.sh`). کلون نسخهٔ
  نصب‌شده فقط فونت/هویت را عوض می‌کند و RTL واقعی نیست.
- Cline به شبکه، Bun، Rust و Xcode CLT نیاز دارد؛ build طولانی است و بدون
  دلیل دوباره اجرا نکنید.
- اگر برنامهٔ اصلی در حال اجراست، اول آن را ببندید. برای پروفایل‌های
  «مشترک»، هم‌زمان اجرا نکنید.
- هیچ توکن، کلید API، رمز، شناسهٔ نشست، مسیر شخصی یا فایل
  `auth.json`/`.env` را در issue، commit یا مستندات نگذارید.
- قبل از هر commit: `node scripts/check-repo.mjs --staged` باید پاس شود.

## درخت تصمیم

```text
کاربر می‌گوید «برای برنامهٔ X نسخهٔ RTL بساز»
  ↓
./rtl-harness doctor
  ↓
./rtl-harness detect
  ↓
slug را از manifest پیدا کن (list/info)
  ↓
appPath وجود دارد؟ ── نه → به کاربر بگو اول برنامه را نصب کند
  ↓ بله
آیا inPlace است؟ ── بله → اجازهٔ صریح + پشتیبان + --allow-in-place
  ↓ نه
آیا profile مشترک است؟ ── بله → به کاربر بگو هر دو را هم‌زمان اجرا نکند
  ↓
./rtl-harness build <slug> --dry-run
  ↓
دستور و خروجی را به کاربر نشان بده
  ↓
./rtl-harness build <slug> --yes
  ↓
./rtl-harness verify <slug>
  ↓
نتیجه را با قالب گزارش پایین بفرست
```

## دستورهای مجاز

```bash
./rtl-harness list
./rtl-harness info <slug>
./rtl-harness detect
./rtl-harness doctor
./rtl-harness build <slug> --dry-run
./rtl-harness build <slug> --yes
./rtl-harness build github-copilot --dry-run
./rtl-harness build github-copilot --yes --allow-in-place
./rtl-harness verify <slug>
./rtl-harness test <slug>
./rtl-harness test --all
./rtl-harness docs <slug>
```

`build` بدون `--yes` در ترمینال تعاملی سؤال می‌پرسد و در محیط غیرتعاملی فقط
plan را چاپ می‌کند. `--dry-run` هیچ فایلی را تغییر نمی‌دهد.

## نسخه‌های جدید

`testedVersion` در manifest نسخه‌ای است که پروژهٔ منبع مستند کرده؛ نسخهٔ
نصب‌شده ممکن است جدیدتر باشد. `detect` وضعیت `version-drift` را نشان می‌دهد.
این یک هشدار است، نه مجوز خودکار برای تغییر منطق پچ. اگر build شکست خورد یا
خروجی bundle ID اشتباه داشت، توقف کن و README/تست همان هارنس را بخوان.

## قالب گزارش

```text
harness: <name> (<slug>)
source: <appPath> (<version>)
output: <outputPath>
mode: copy | in-place
profile: shared | separate
command: <argv>
verify: ok | failed (<reason>)
warnings: <version drift / shared profile / in-place / other>
notes: <what the user must do next>
```

هیچ مسیر شخصی یا مقدار حساسی در گزارش نگذارید.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](AUTHORS.md)

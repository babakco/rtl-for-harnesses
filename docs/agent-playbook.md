# دستور کار ایجنت

این سند برای ایجنتی است که باید از این مخزن یک هارنس RTL بسازد یا بررسی کند.
`AGENTS.md` قرارداد کوتاه است؛ اینجا جزئیات اجرایی و شرایط توقف آمده است.

## ترتیب

1. `AGENTS.md`
2. `manifest.json`
3. `harnesses/<slug>/README.md`
4. `docs/safety.md`
5. در صورت خطا: `docs/troubleshooting.md`

## گام ۱: بررسی محیط

```bash
./rtl-harness doctor
./rtl-harness detect
```

- اگر `platform` برابر `darwin` نیست، توقف کن.
- اگر Node < 18 است، توقف کن.
- اگر ابزار لازم همان هارنس نیست، به کاربر بگو و توقف کن.
- `source-missing` یعنی برنامهٔ اصلی نصب نیست؛ بدون نصب، build نکن.

## گام ۲: انتخاب هارنس

```bash
./rtl-harness list
./rtl-harness info <slug>
```

از `manifest.json` این‌ها را بخوان:

- `appPath` و `outputPath`
- `inPlace`
- `profile`
- `entry` و `verify`
- `testedVersion`
- `notes`

اگر slug در manifest نیست، حدس نزن. به کاربر بگو موجود نیست.

## گام ۳: تصمیم ایمنی

```text
inPlace == true ?
  ├── بله → اجازهٔ صریح کاربر + پشتیبان + --allow-in-place
  └── نه  → copy mode
profile == shared ?
  ├── بله → به کاربر بگو هر دو را هم‌زمان اجرا نکند
  └── نه  → اجرای هم‌زمان مجاز است
```

برای GitHub Copilot:

- `patch.sh` **قبل از تزریق** پشتیبان را در
  `$HOME/CopilotRTLBackup/GitHub Copilot.app` می‌سازد.
- بعد از شروع build مطمئن شو پشتیبان ساخته شده است؛ اگر نشد، متوقف شو و
  برنامه را دستی از منبع رسمی دوباره نصب کن.
- فقط با `--allow-in-place` اجرا کن.

برای OpenCode:

- دستور باید `--rtl-app` داشته باشد.
- هرگز `--update` اضافه نکن.
- هرگز حالت no-flag را اجرا نکن.

برای Zed:

- `scripts/build-zed-rtl.sh` روش اصلی است.
- `make-rtl-app-from-installed.sh` را به‌عنوان RTL معرفی نکن.

## گام ۴: پیش‌نمایش

```bash
./rtl-harness build <slug> --dry-run
```

خروجی باید شامل این‌ها باشد:

- source path و version
- output path
- mode: copy/in-place
- profile
- command
- warnings (version drift/shared/in-place)

اگر command با `entry` در manifest فرق داشت، توقف کن و گزارش بده.

## گام ۵: ساخت

```bash
./rtl-harness build <slug> --yes
```

- برنامهٔ اصلی باید بسته باشد.
- در صورت خطا، خروجی کامل را نگه دار؛ اما token/path شخصی را در گزارش
  عمومی نگذار.
- بعد از build، خروجی را دستی باز نکن؛ اول verify.

## گام ۶: تأیید

```bash
./rtl-harness verify <slug>
```

این دستور بررسی می‌کند:

- خروجی وجود دارد؛
- `CFBundleIdentifier` با `outputBundleId` می‌خواند؛
- `codesign --verify --deep --strict` پاس می‌شود؛
- `verify` خود هارنس پاس می‌شود.

اگر verify شکست خورد، build را کورکورانه تکرار نکن. علت را از
`docs/troubleshooting.md` پیدا کن.

## گام ۷: گزارش

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

## شرایط توقف فوری

- منبع اصلی در حال اجراست و بستن آن ممکن نیست.
- `inPlace` است و کاربر اجازهٔ صریح نداده.
- پشتیبان Copilot وجود ندارد.
- `appPath` وجود ندارد.
- `version-drift` با خطای build همراه است.
- `verify` شکست خورده و علت مشخص نیست.
- اسکنر حریم خصوصی hit دارد.
- کاربر می‌خواهد فایل حساس یا credential را commit کند.

## چه کاری نکن

- پچ درجا برای هارنس غیر Copilot.
- اجرای OpenCode بدون `--rtl-app`.
- تغییر selector/regex برای «سازگاری» بدون تست.
- حذف تست‌ها برای سبز شدن CI.
- commit با `--no-verify` یا دور زدن اسکنر.
- نسبت دادن پچ‌ها به کسی جز **Mehdi Ravanbakhsh**.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

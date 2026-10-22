# عیب‌یابی

## اول این‌ها را اجرا کنید

```bash
./rtl-harness doctor
./rtl-harness detect
./rtl-harness info <slug>
./rtl-harness build <slug> --dry-run
```

`detect` وضعیت هر هارنس را نشان می‌دهد:

| وضعیت | معنی | کار |
|---|---|---|
| `ok` | برنامه و خروجی هستند و bundle ID درست است | ادامه |
| `source-missing` | برنامهٔ اصلی پیدا نشد | نصب برنامه یا اصلاح `appPath` |
| `not-built` | خروجی RTL وجود ندارد | build |
| `wrong-bundle-id` | خروجی قدیمی/اشتباه است | build دوباره |
| `version-drift` | نسخهٔ نصب‌شده با نسخهٔ مستند فرق دارد | README هارنس را بخوانید |

## برنامهٔ اصلی پیدا نمی‌شود

```bash
ls -ld "/Applications/<App>.app"
plutil -extract CFBundleIdentifier raw -o - "/Applications/<App>.app/Contents/Info.plist"
```

اگر مسیر برنامه عوض شده، `appPath` در `manifest.json` را اصلاح کنید؛ خودسرانه
مسیر را در اسکریپت هارنس تغییر ندهید. برای Codex/Cline/Claude خروجی ممکن است
در `$HOME/Applications` باشد، نه `/Applications`.

## build شکست می‌خورد

1. برنامهٔ اصلی را ببندید.
2. `./rtl-harness build <slug> --dry-run` را ببینید؛ آیا دستور و cwd درست است؟
3. لاگ کامل را با `--yes` و بدون بریدن خروجی اجرا کنید.
4. README همان هارنس و `docs/reference*.md` را بخوانید.
5. اگر خطا مربوط به نسخه بود، `version-drift` را جدی بگیرید؛ ممکن است پچ
   برای نسخهٔ جدید نیاز به به‌روزرسانی داشته باشد.

## امضا شکست می‌خورد

```bash
codesign --verify --deep --strict "/Applications/<RTL>.app"
codesign -dv --verbose=4 "/Applications/<RTL>.app"
```

اگر خروجی «code object is not signed at all» یا «invalid signature» داد:

```bash
codesign --force --deep --sign - "/Applications/<RTL>.app"
codesign --verify --deep --strict "/Applications/<RTL>.app"
```

اگر helper یا framework جداگانه دارد، ابتدا همان‌ها را امضا کنید، بعد برنامهٔ
اصلی. برای Codex، ترتیب امضا اهمیت دارد؛ اسکریپت خودش این کار را انجام
می‌دهد و نباید دستی وسط کار دخالت کرد.

## برنامه باز نمی‌شود

- Console.app را باز کنید و پیام‌های برنامه را ببینید.
- از Terminal اجرا کنید تا خطا را ببینید:
  ```bash
  "/Applications/<RTL>.app/Contents/MacOS/<Binary>"
  ```
- معماری را بررسی کنید:
  ```bash
  uname -m
  file "/Applications/<RTL>.app/Contents/MacOS/<Binary>"
  ```
  dylib کوپایلوت arm64 است؛ روی Intel باید `build.sh` اجرا شود.
- اگر macOS هشدار Gatekeeper داد، از System Settings > Privacy & Security
  اجازه بدهید. `spctl --master-disable` را اجرا نکنید.
- اگر دو نسخه هم‌زمان باز هستند و پروفایل مشترک است، یکی را ببندید.

## خطای asar integrity

Codex، MiMo و برخی برنامه‌های Electron فیلد `ElectronAsarIntegrity` را
بررسی می‌کنند. اگر بعد از تزریق، برنامه صفحهٔ سفید یا خطای integrity داد:

1. build را از نسخهٔ اصلی دوباره اجرا کنید (نه از خروجی نیمه‌کاره).
2. مطمئن شوید اسکریپت `Info.plist` را به‌روزرسانی کرده است.
3. امضا را بعد از integrity انجام دهید.
4. برای Codex، `docs/reference.fa.md` و `docs/UPSTREAM-CHANGES.md` را بخوانید.

## پروفایل مشترک / single-instance

اگر برنامهٔ RTL باز نمی‌شود یا داده‌ها قاطی می‌شوند:

```bash
pgrep -fl "<App>"
```

هر دو نسخه را ببندید و فقط یکی را باز کنید. هارنس‌های shared:
DeepSeek Harness، OpenCode، WorkBuddy AI، ZCode، Freebuff، Codex، Kimi،
Zed، Antigravity، Qoder، MiMo، Copilot و Claude. MiniMax و Cline پروفایل
جدا دارند.

## Node، Python یا npx پیدا نمی‌شود

```bash
node --version
python3 --version
npx --version
xcode-select -p
cargo --version
bun --version
```

- Node باید ۱۸ یا جدیدتر باشد.
- `python3` برای MiMo/Qoder/Antigravity/DSH لازم است.
- `npx` برای Codex/Claude/Qoder/Antigravity.
- Zed/Cline به Xcode CLT و Rust/Bun نیاز دارند.

## Cline build طولانی یا ناموفق است

- شبکه را بررسی کنید.
- `bun --version`، `cargo --version` و `xcode-select -p` را چک کنید.
- patch فعلی برای `0.0.45` است؛ اگر نسخهٔ نصب‌شده جدیدتر است،
  `--from-installed` را امتحان کنید اما انتظار داشته باشید patch نیاز به
  به‌روزرسانی داشته باشد.
- build را با لاگ کامل اجرا کنید و خطای اولین مرحله را دنبال کنید.

## Zed build ناموفق است

- `xcodebuild -version` و `cargo --version` را چک کنید.
- کلون/به‌روزرسانی مخزن Zed ممکن است به شبکه نیاز داشته باشد.
- fallback `make-rtl-app-from-installed.sh` فقط فونت/هویت را عوض می‌کند و
  RTL واقعی نیست؛ آن را به‌عنوان راه‌حل اصلی معرفی نکنید.

## GitHub Copilot

- فقط arm64.
- قبل از patch پشتیبان بگیرید:
  `$HOME/CopilotRTLBackup/GitHub Copilot.app`
- اگر patch نیمه‌کاره ماند:
  ```bash
  cd harnesses/github-copilot
  bash uninstall.sh
  ```
- اگر پشتیبان وجود ندارد، برنامه را از منبع رسمی دوباره نصب کنید.

## لاگ‌های macOS

```bash
log show --last 5m --predicate 'process CONTAINS "<App>"' --style compact
```

برای خطاهای launch:

```bash
log show --last 5m --predicate 'eventMessage CONTAINS "code signature"' --style compact
```

## هنوز حل نشد؟

یک issue با این اطلاعات باز کنید (بدون مسیر شخصی و بدون token):

- macOS version و معماری (`uname -m`)
- نسخهٔ برنامهٔ اصلی و خروجی
- slug هارنس
- خروجی `./rtl-harness detect`
- متن خطای build/verify (پاکسازی‌شده)
- آیا پروفایل مشترک بوده و هر دو باز بوده‌اند

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

# ایمنی

## قانون اول: کپی، نه تخریب

حالت پیش‌فرض همهٔ هارنس‌ها **copy mode** است: برنامهٔ اصلی
`/Applications/<App>.app` خوانده می‌شود و یک برنامهٔ جدید با نام RTL ساخته
می‌شود. برنامهٔ اصلی، پروفایل و auto-update آن دست‌نخورده می‌ماند.

تنها استثنا **GitHub Copilot** است. این هارنس dylib را به همان
`/Applications/GitHub Copilot.app` تزریق می‌کند و درجا پچ می‌شود. برای آن:

1. برنامه را ببندید.
2. `patch.sh` قبل از تزریق، پشتیبان را در
   `$HOME/CopilotRTLBackup/GitHub Copilot.app` می‌سازد؛ بعد از شروع build
   وجود آن را بررسی کنید.
3. فقط با `--allow-in-place` اجرا کنید:
   ```bash
   ./rtl-harness build github-copilot --yes --allow-in-place
   ```
4. برای بازگردانی:
   ```bash
   cd harnesses/github-copilot
   bash uninstall.sh
   ```

هرگز `--allow-in-place` را برای هارنس دیگری اضافه نکنید؛ CLI آن را فقط برای
همان یک هارنس می‌پذیرد.

## قبل از build

- برنامهٔ اصلی را ببندید. CLI تلاش می‌کند پروسه را تشخیص دهد و متوقف شود،
  اما بستن دستی مطمئن‌تر است.
- از فضای دیسک مطمئن شوید (`./rtl-harness doctor`).
- اگر هارنس پروفایل «مشترک» دارد، هم‌زمان با برنامهٔ اصلی اجرا نکنید.
- برای buildهای سورس (Zed/Cline) به Xcode CLT، Rust، Bun و شبکه نیاز دارید.
- اگر نسخهٔ نصب‌شده از `testedVersion` جدیدتر است، `version-drift` فقط یک
  هشدار است؛ README همان هارنس را بخوانید و بدون شواهد، منطق پچ را عوض نکنید.

## امضای ad-hoc

این buildها با `codesign --force --deep --sign -` امضا می‌شوند. این امضا:

- برای اجرای محلی روی همان Mac کافی است؛
- **notarized نیست** و توسط Apple تأیید نشده؛
- بعد از هر تغییر در bundle باید دوباره انجام شود.

تأیید:

```bash
codesign --verify --deep --strict "/Applications/ZCode-RTL.app"
codesign -dv --verbose=4 "/Applications/ZCode-RTL.app"
```

اگر macOS در اولین اجرا هشدار داد، از **System Settings → Privacy &
Security** اجازهٔ اجرا بدهید. غیرفعال کردن Gatekeeper برای کل سیستم یا
`spctl --master-disable` توصیه نمی‌شود.

## قرنطینه (quarantine)

اگر برنامه از یک آرشیو دانلود شده باشد، ممکن است attribute قرنطینه داشته
باشد:

```bash
xattr -l "/Applications/ZCode-RTL.app"
```

حذف قرنطینه فقط وقتی منطقی است که منبع فایل را می‌شناسید:

```bash
xattr -dr com.apple.quarantine "/Applications/ZCode-RTL.app"
```

این کار ریسک امنیتی را حذف نمی‌کند؛ فقط هشدار macOS را دور می‌زند. برای
برنامه‌ای که خودتان build کرده‌اید معمولاً لازم نیست.

## auto-update

نسخه‌های RTL معمولاً self-updater را خاموش می‌کنند تا آپدیت upstream، پچ را
پاک نکند. با این حال:

- بعد از هر آپدیت برنامهٔ اصلی، همان دستور build را دوباره اجرا کنید.
- اگر نسخهٔ RTL خودش را آپدیت کرد، ممکن است پچ از بین برود؛ `verify` را
  دوباره اجرا کنید.
- OpenCode RTL-2 (اگر دستی ساخته شود) مسیر جداگانه دارد؛ build پیش‌فرض این
  مخزن فقط `OpenCode-RTL.app` است.

## پروفایل مشترک

پروفایل مشترک یعنی دو برنامه یک userData، قفل فایل و session را هم‌زمان
استفاده می‌کنند. نتیجه می‌تواند خرابی داده یا خطای single-instance باشد.
هارنس‌های دارای پروفایل مشترک در README خودشان علامت‌گذاری شده‌اند. قبل از
اجرای RTL، نسخهٔ اصلی را ببندید.

## بازگردانی

| هارنس | روش |
|---|---|
| همهٔ کپی‌ها | خروجی RTL را به سطل زباله ببرید |
| MiniMax Code | `cd harnesses/minimax-code && bash restore.sh` |
| Kimi | `cd harnesses/kimi && bash restore.sh` |
| GitHub Copilot | `cd harnesses/github-copilot && bash uninstall.sh` |
| Claude Desktop (فقط اگر `--install` زده‌اید) | `cd harnesses/claude-desktop && bash patch-live.sh --restore` |

## مجوزها و دسترسی

اگر build با `Operation not permitted` متوقف شد:

- برنامه را ببندید؛
- مطمئن شوید Terminal/IDE اجازهٔ نوشتن در `/Applications` دارد؛
- برای buildهای سورس، مسیر cache را بررسی کنید؛
- از `sudo` فقط در صورت لزوم و با درک کامل استفاده کنید. CLI خودش sudo
  اجرا نمی‌کند.

## چه چیزی را commit نکنید

`.env*`، `auth.json`، `credentials*`، `*.pem`، `*.p12`، `*.key`،
`id_rsa*`، `*.kdbx`، خروجی build، `node_modules`، `.venv`، `target` و
هر فایل حاوی توکن یا مسیر شخصی. اسکنر:

```bash
node scripts/check-repo.mjs
node scripts/check-repo.mjs --staged
```

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

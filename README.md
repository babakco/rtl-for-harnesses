# RTL for AI Harnesses

پچ‌های راست‌چین فارسی، فونت وزیرمتن و ابزارهای ساخت/تأیید/بازگردانی برای
هارنس‌های کدنویسی macOS — یک‌جا، قابل تکرار و با حالت پیش‌فرض ایمن.

این مخزن ۱۵ پروژهٔ جداگانه را در یک ساختار یکسان جمع می‌کند، بدون اینکه منطق
آزموده‌شدهٔ هیچ‌کدام را بازنویسی کند. هر هارنس پوشهٔ مستقل خودش را دارد و یک
CLI بدون وابستگی، ساخت و تأیید را هماهنگ می‌کند.

> **توسعه‌دهنده:** [Mehdi Ravanbakhsh](AUTHORS.md)

## وضعیت انتشار

این مخزن عمومی است: هر کسی می‌تواند آن را clone یا fork کند و از پچ‌ها
استفاده کند. دسترسی نوشتن فقط برای مالک است؛ کاربران دیگر نمی‌توانند در همین
مخزن commit یا push کنند. به‌روزرسانی‌ها را مالک انجام می‌دهد.

مخزن: <https://github.com/babakco/rtl-for-harnesses>

## چرا این مخزن؟

- **یک ورودی برای همه:** `./rtl-harness list` و `info <slug>`.
- **حالت پیش‌فرض کپی:** برنامهٔ اصلی دست‌نخورده می‌ماند. تنها استثنا
  GitHub Copilot است که درجا پچ می‌شود و `--allow-in-place` می‌خواهد.
- **بدون وابستگی npm:** CLI فقط با Node.js 18+ کار می‌کند.
- **مستندات فارسی:** هر هارنس README فارسی با دستورهای دقیق دارد.
- **دروازهٔ حریم خصوصی:** اسکن توکن/کلید/مسیر شخصی قبل از هر commit.

## هارنس‌ها

| هارنس | slug | برنامهٔ اصلی | خروجی RTL | روش | پروفایل |
|---|---|---|---|---|---|
| [DeepSeek Harness](harnesses/deepseek-harness/README.md) | `deepseek-harness` | `/Applications/DeepSeek Harness.app` | `/Applications/DeepSeek Harness-RTL.app` | `electron-asar` | مشترک |
| [MiniMax Code](harnesses/minimax-code/README.md) | `minimax-code` | `/Applications/MiniMax Code.app` | `/Applications/MiniMax Code-RTL.app` | `electron-asar-preload` | جدا |
| [OpenCode](harnesses/opencode/README.md) | `opencode` | `/Applications/OpenCode.app` | `/Applications/OpenCode-RTL.app` | `electron-asar` | مشترک |
| [WorkBuddy AI](harnesses/workbuddy-ai/README.md) | `workbuddy-ai` | `/Applications/WorkBuddy AI.app` | `/Applications/WorkBuddy AI RTL.app` | `electron-asar-surgical` | مشترک |
| [ZCode](harnesses/zcode/README.md) | `zcode` | `/Applications/ZCode.app` | `/Applications/ZCode-RTL.app` | `electron-asar` | مشترک |
| [Freebuff](harnesses/freebuff/README.md) | `freebuff` | `/Applications/Freebuff.app` | `/Applications/Freebuff-RTL.app` | `electron-asar` | مشترک |
| [Codex (ChatGPT desktop)](harnesses/codex/README.md) | `codex` | `/Applications/ChatGPT.app` | `$HOME/Applications/ChatGPT-RTL.app` | `electron-asar-framework` | مشترک |
| [Kimi](harnesses/kimi/README.md) | `kimi` | `/Applications/Kimi.app` | `/Applications/Kimi RTL.app` | `electron-asar-preload` | مشترک |
| [Zed](harnesses/zed/README.md) | `zed` | `/Applications/Zed.app` | `/Applications/Zed-RTL.app` | `native-source-rust` | مشترک |
| [Google Antigravity](harnesses/antigravity/README.md) | `antigravity` | `/Applications/Antigravity.app` | `/Applications/Antigravity RTL.app` | `electron-asar-preload` | مشترک |
| [Qoder](harnesses/qoder/README.md) | `qoder` | `/Applications/Qoder.app` | `/Applications/Qoder-RTL.app` | `electron-asar-surgical` | مشترک |
| [Cline](harnesses/cline/README.md) | `cline` | `/Applications/Cline.app` | `$HOME/Applications/Cline RTL.app` | `tauri-source` | جدا |
| [Xiaomi MiMo AI](harnesses/xiaomi-mimo/README.md) | `xiaomi-mimo` | `/Applications/Xiaomi MiMo AI.app` | `/Applications/Xiaomi MiMo AI-RTL.app` | `electron-asar` | مشترک |
| [GitHub Copilot](harnesses/github-copilot/README.md) | `github-copilot` | `/Applications/GitHub Copilot.app` | `/Applications/GitHub Copilot.app` | `webkit-dylib` | مشترک |
| [Claude Desktop](harnesses/claude-desktop/README.md) | `claude-desktop` | `/Applications/Claude.app` | `$HOME/Applications/Claude-RTL.app` | `electron-asar` | مشترک |

نسخه‌های مستند و آخرین تأیید در `manifest.json` و README هر هارنس ثبت شده‌اند.
نسخهٔ نصب‌شدهٔ شما ممکن است جدیدتر باشد؛ `./rtl-harness detect` این اختلاف را
نشان می‌دهد.

## پیش‌نیازها

- macOS (Intel برای GitHub Copilot فقط با بازسازی dylib).
- Node.js 18 یا جدیدتر برای CLI.
- برای ساخت‌های سورس: Xcode Command Line Tools، Rust/Cargo (Zed)،
  Bun و شبکه (Cline).
- برای برخی پچ‌ها: `python3`، `npx`، `codesign`، `plutil`.

بررسی خودکار:

```bash
./rtl-harness doctor
```

## شروع سریع

```bash
git clone https://github.com/babakco/rtl-for-harnesses.git
cd rtl-for-harnesses
./rtl-harness doctor
./rtl-harness detect
./rtl-harness list
```

ساخت یک هارنس در حالت کپی:

```bash
./rtl-harness build zcode --yes
./rtl-harness verify zcode
open "/Applications/ZCode-RTL.app"
```

دیدن دستور بدون اجرا:

```bash
./rtl-harness build zcode --dry-run
```

ساخت درجا (فقط GitHub Copilot، با تأیید صریح):

```bash
./rtl-harness build github-copilot --yes --allow-in-place
```

## حالت ایجنت

اگر یک ایجنت کدنویسی هستید، ابتدا [`AGENTS.md`](AGENTS.md) را بخوانید. ترتیب
اجباری: `AGENTS.md` → `manifest.json` → README همان هارنس →
[`docs/safety.md`](docs/safety.md). سپس:

```bash
./rtl-harness doctor
./rtl-harness detect
./rtl-harness info <slug>
./rtl-harness build <slug> --dry-run
./rtl-harness build <slug> --yes
./rtl-harness verify <slug>
```

هیچ ایجنتی نباید بدون اجازهٔ صریح کاربر پچ درجا اجرا کند، و هیچ‌وقت نباید
OpenCode را بدون `--rtl-app` اجرا کند.

## ایمنی

- **کپی، نه تخریب:** همهٔ هارنس‌ها به‌جز GitHub Copilot از نسخهٔ اصلی کپی
  می‌سازند. برای حذف، خروجی RTL را به سطل زباله ببرید.
- **GitHub Copilot:** درجا پچ می‌شود؛ پشتیبان در
  `$HOME/CopilotRTLBackup/GitHub Copilot.app` ساخته می‌شود و
  `uninstall.sh` آن را برمی‌گرداند.
- **OpenCode:** فقط `OpenCode-RTL.app` با `--rtl-app` ساخته می‌شود. حالت
  no-flag برنامهٔ اصلی را درجا تغییر می‌دهد و در این مخزن استفاده نمی‌شود.
- **Zed:** ساخت اصلی از سورس Rust است؛ کلون نسخهٔ نصب‌شده فقط فونت/هویت
  می‌دهد و RTL واقعی نیست.
- **پروفایل مشترک:** اگر README هارنس می‌گوید «مشترک»، هم‌زمان با برنامهٔ
  اصلی اجرا نکنید.
- **آپدیت:** بعد از هر آپدیت برنامهٔ اصلی، همان دستور build را دوباره اجرا
  کنید. پچ‌ها self-update را در نسخهٔ RTL خاموش می‌کنند.

جزئیات: [`docs/safety.md`](docs/safety.md)

## ساختار مخزن

```text
rtl-harness              # CLI
manifest.json            # ثبت ۱۵ هارنس
harnesses/<slug>/        # کد، payload، فونت، تست و README هر هارنس
docs/                    # معماری، ایمنی، عیب‌یابی، حریم خصوصی
scripts/check-repo.mjs   # اسکن حریم خصوصی و یکپارچگی
```

## مستندات

- [`docs/support-matrix.md`](docs/support-matrix.md) — جدول کامل پشتیبانی
- [`docs/architecture.md`](docs/architecture.md) — روش‌های تزریق RTL
- [`docs/agent-playbook.md`](docs/agent-playbook.md) — دستور کار ایجنت
- [`docs/safety.md`](docs/safety.md) — ایمنی، پشتیبان و امضا
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — خطاهای رایج
- [`docs/updating.md`](docs/updating.md) — بازسازی بعد از آپدیت
- [`docs/privacy.md`](docs/privacy.md) — سیاست پاکسازی
- [`README.en.md`](README.en.md) — English translation

## عیب‌یابی سریع

- **`source-missing`:** برنامهٔ اصلی در `/Applications` نیست؛ اول نصبش کنید.
- **`version-drift`:** نسخهٔ نصب‌شده با نسخهٔ مستند فرق دارد؛ README هارنس را
  ببینید. نسخه‌های جدید ممکن است به build مجدد یا پچ جدید نیاز داشته باشند.
- **`wrong-bundle-id`:** خروجی قدیمی است؛ build را دوباره اجرا کنید.
- **خطای امضا:** `codesign --verify --deep --strict` را روی خروجی اجرا کنید و
  README همان هارنس را ببینید.
- **برنامه باز نمی‌شود:** Console.app را ببینید و مطمئن شوید نسخهٔ اصلی و RTL
  هم‌زمان اجرا نشده‌اند.

## مجوز و اعتبار

کد این مخزن و پچ‌ها تحت مجوز MIT و با حق تکثیر **Mehdi Ravanbakhsh** منتشر
شده‌اند. فونت وزیرمتن تحت SIL OFL 1.1 است. اعتبار پروژهٔ بالادستی Claude
Desktop در [`NOTICE.md`](NOTICE.md) حفظ شده است. این پروژه غیررسمی است و به
هیچ‌کدام از شرکت‌های سازندهٔ برنامه‌ها وابسته نیست.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](AUTHORS.md)

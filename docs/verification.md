# تأیید و شواهد

تاریخ تأیید: ۲۰۲۶-۱۰-۲۲ (UTC)
میزبان: macOS 27.0.1، arm64
Node.js: 26.12.0

این سند فقط نتایجی را ثبت می‌کند که در همین مخزن یا روی همین میزبان اجرا شده‌اند.
«تأیید خروجی موجود» با «بازسازی از سورس» یکی نیست؛ تفاوت در جدول‌ها مشخص شده است.

## ۱. بررسی‌های ایستا

| بررسی | نتیجه |
|---|---|
| `node --test tests/` | ۲۱ تست، ۲۱ pass، ۰ fail |
| `node scripts/check-repo.mjs` | ۲۵۷ فایل، ۰ خطا، ۰ hit حریم خصوصی |
| `node --check bin/rtl-harness.mjs` | pass |
| `node --check bin/lib/manifest.mjs` | pass |
| `node --check bin/lib/commands.mjs` | pass |
| `node --check scripts/check-repo.mjs` | pass |
| `clang -fsyntax-only -fobjc-arc harnesses/github-copilot/injector/copilot_rtl_inject.m` | pass |
| `bash -n` روی همهٔ `harnesses/**/*.sh` | pass |
| `bash -n rtl-harness` | pass |
| `strings -a harnesses/github-copilot/injector/copilot_rtl_inject.dylib` | هیچ `/Users/` یا نام کاربری ندارد |

تست‌های CLI شامل manifest، مسیر `cwd`، گسترش `$HOME`، refusal پچ درجا بدون
`--allow-in-place`، dry-run درجا، parse آرگومان‌ها و جدول خروجی است.
تست‌های checker شامل تشخیص مسیر شخصی، کلید OpenAI، allowlist نام توسعه‌دهنده،
placeholder، فایل ممنوع، فایل بزرگ‌تر از ۵ مگابایت، حالت missing-docs،
اسکن فایل‌های منبع و خواندن فایل binary بزرگ‌تر از ۱ مگابایت از index است.
اسکنر پسوندهای منبع مانند `.m`، `.h`، `.c`، `.cpp`، `.rs`، `.swift` و
`.patch` را هم به‌صورت متنی بررسی می‌کند.

## ۲. smoke تست CLI

| دستور | نتیجه |
|---|---|
| `./rtl-harness list` | ۱۵ ردیف |
| `./rtl-harness info zcode` | مسیرها، bundle ID، profile و warning درست |
| `./rtl-harness detect` | ۱۵ ردیف؛ ۱۱ `ok` و ۴ `version-drift` |
| `./rtl-harness doctor` | macOS/Node/disk و readiness هر ۱۵ هارنس |
| `./rtl-harness build zcode --dry-run` | plan چاپ شد؛ هیچ فایلی تغییر نکرد |
| `./rtl-harness build github-copilot --dry-run` | `IN-PLACE` و هشدار پشتیبان؛ هیچ فایلی تغییر نکرد |
| `./rtl-harness build zcode` بدون `--yes` | فقط plan؛ بدون اجرا (non-interactive) |

`doctor` نبود `cargo` و `rustc` را گزارش کرد. این برای buildهای Electron
مانع نیست، اما Zed و Cline را در این میزبان غیرقابل build می‌کند.

## ۳. تأیید خروجی‌های موجود (بدون rebuild)

همهٔ ۱۵ خروجی که از قبل روی این میزبان نصب بودند، با
`./rtl-harness verify <slug>` بررسی شدند:

| معیار | نتیجه |
|---|---|
| وجود خروجی | ۱۵ از ۱۵ |
| تطابق `outputBundleId` | ۱۵ از ۱۵ |
| `codesign --verify --deep --strict` | ۱۵ از ۱۵ |
| `verify` دستور هارنس | ۱۵ از ۱۵ |

این جدول **rebuild** نیست. فقط نشان می‌دهد خروجی‌های موجود با manifest
سازگارند و امضای معتبر دارند. به‌جز ZCode، هیچ هارنس دیگری در این مخزن از
سورس بازسازی نشد.

## ۴. ZCode smoke build (تأییدشده)

| مرحله | نتیجه |
|---|---|
| source | `/Applications/ZCode.app` — نسخهٔ `3.16.2` |
| command | `node bin/zcode-rtl-patch.mjs` در `harnesses/zcode` |
| output | `/Applications/ZCode-RTL.app` |
| bundle id | `dev.zcode.app.rtl` |
| codesign | `ok` |
| `./rtl-harness verify zcode` | `ok` |
| launch | برنامه باز شد؛ renderer از `app.asar` بارگذاری شد؛ سپس quit شد |

build از نسخهٔ اصلی کپی می‌کند، auto-update را خاموش می‌کند، helperها را
تغییر نام می‌دهد و امضای ad-hoc می‌زند. برنامهٔ اصلی `ZCode.app` دست‌نخورده
ماند. پوشهٔ موقت `harnesses/zcode/build` بعد از تأیید حذف شد و commit نمی‌شود.
`lastVerifiedVersion` برای ZCode در manifest به `3.16.2` به‌روزرسانی شد.

## ۵. تست‌های خود هارنس‌ها

| هارنس | شمار تست | نتیجه |
|---|---|---|
| `zcode` | ۹ | pass |
| `freebuff` | ۲۶ | pass |
| `codex` | ۸۲ | pass |
| `antigravity` | ۱۹ | pass |
| `zed` | — | اجرا نشد: `cargo` نصب نیست |
| سایر هارنس‌ها | — | تست خودکار در این مخزن ثبت نشده |

`./rtl-harness test --all` به دلیل نبود `cargo` برای Zed با کد ۱ پایان
می‌یابد. اجرای جداگانهٔ چهار هارنس بالا موفق است. این محدودیت میزبان است، نه
شکست تست کد.

## ۶. تطابق فایل‌ها

مقایسهٔ SHA-256 فایل‌های کپی‌شده (کد، payload، فونت و تست؛ بدون README و
مستندات بازنویسی‌شده):

| معیار | نتیجه |
|---|---|
| فایل‌های یکسان | ۱۵۹ |
| فایل‌های عمداً کپی‌نشده | ۱۵ (build cache، parity، backup، installer غیرمرتبط) |
| تغییر عمدی | ۴ (`zcode/package.json`؛ حذف اسکریپت parity، `github-copilot/build.sh`؛ install_name و حداقل macOS، `github-copilot/injector/copilot_rtl_inject.m`؛ حذف دو مسیر مطلق، و dylib بازسازی‌شده) |
| mismatch غیرمنتظره | ۰ |

مسیرهای مطلق منبع در این سند ثبت نشده‌اند.

## ۷. بررسی خوانندهٔ تازه

با خواندن فقط `AGENTS.md`، `manifest.json` و `README.md`:

- slug درست `zcode` پیدا شد؛
- خروجی `/Applications/ZCode-RTL.app` و پروفایل مشترک تشخیص داده شد؛
- دستور dry-run و verify تولید شد؛
- `build github-copilot --dry-run` بدون اجازه، فقط هشدار `IN-PLACE` چاپ کرد
  و اجرا نشد؛
- هیچ مسیر شخصی یا credential لازم نبود.

## ۸. محدودیت‌ها و کارهای باقی‌مانده

- ۱۴ هارنس دیگر در این مخزن از سورس rebuild نشدند؛ فقط خروجی موجودشان
  read-only تأیید شد.
- Zed و Cline به دلیل نبود Rust/Cargo build نشدند؛ Cline علاوه بر آن به
  شبکه، Bun و Xcode CLT نیاز دارد.
- تأیید بصری RTL در همهٔ برنامه‌ها انجام نشده؛ ZCode فقط launch شد.
- GitHub Copilot درجا تست نشد؛ این کار نیاز به اجازهٔ صریح و پشتیبان دارد.
- `version-drift` برای Codex، Qoder، Cline و GitHub Copilot دیده شد.
- هیچ remote گیت‌هاب ساخته نشده و هیچ push انجام نشده است.
- اسکن `--staged` باید درست قبل از commit نهایی دوباره اجرا شود.

## ۹. نتیجه

وضعیت محلی برای بازبینی مالک آماده است: اسکلت، CLI، manifest، ۱۵ هارنس،
مستندات فارسی، اسکن حریم خصوصی و smoke build ZCode. انتشار عمومی تا تأیید
صریح مالک متوقف است.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

# Quick start patch

این کارت یک‌صفحه‌ای بازپچ بعد از هر به‌روزرسانی است. دامنه فقط جهت متن و فونت است؛ چیدمان `UI` آینه نمی‌شود. مبدأ (پیش‌فرض `/Applications/ChatGPT.app`، با `CHATGPT_APP_SRC` قابل‌تغییر) هرگز تغییر نمی‌کند. خروجی `~/Applications/ChatGPT-RTL.app` است. هرگز اصلی و `RTL` را هم‌زمان اجرا نکن چون شناسهٔ `com.openai.codex` و پروفایل مشترک است.

## Command

اپ مبدأ را ببند، بعد «پچ کن» (اگر نسخهٔ جدید در `~/Applications` نصب شده، سطر دوم):

```sh
./patch-codex-rtl.sh --make-rtl
CHATGPT_APP_SRC="$HOME/Applications/ChatGPT.app" ./patch-codex-rtl.sh --make-rtl
```

همین فرمان `preflight` و کپی و `extract` و `inject` هر دو `HTML` قبل از `</head>` و `pack` با `unpack` مشتق‌شده در ران‌تایم از `app.asar.unpacked` (در حال حاضر `better-sqlite3` و `node-pty` و `objc-js` و `@worklouder`) و به‌روزرسانی هر دو مُهر (`ElectronAsarIntegrity` در `Contents/Info.plist` با هش `HEADER` نه کل فایل، و شکاف `__DATA_CONST,__asar_integrity` با نگهبان `AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A`) و نوشتن `Contents/.codex-rtl-patch.json` قبل از `codesign` و امضای `codesign --force --deep --options runtime --sign -` با حداقل `entitlement` (حذف `com.apple.application-identifier` و `com.apple.developer.team-identifier` و `keychain-access-groups` و `com.apple.developer.aps-environment` و `com.apple.developer.usernotifications.communication`، نگه‌داشتن همهٔ `com.apple.security.*`، افزودن `com.apple.security.cs.disable-library-validation`) را انجام می‌دهد.

## 3 checks

هر سه باید پاس شوند:

```sh
codesign --verify --deep --strict ~/Applications/ChatGPT-RTL.app
./patch-codex-rtl.sh --status
node --test tests/
```

یکم: `codesign --verify --deep --strict` خروج `0` و امضای `flags=0x10002(adhoc,runtime)` را بدهد. دوم: `--status` نشان `Contents/.codex-rtl-patch.json` را با `sourceVersion 26.1007.30912` و `sourceBuild 20156` و `asarSha256Before 75e397e2280dde93b70a85aa926f4282c728eacc84dfeb15ba7fb6ddd84628af` نشان بدهد. سوم: پنجره سفید نباشد و هوک `document.documentElement.dataset.codexRtl = "1"` برقرار باشد؛ در اولین اجرا یک‌بار تأیید `Keychain` با نام `Codex Safe Storage` طبیعی است.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

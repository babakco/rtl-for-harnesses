# ChatGPT RTL — پچ راست‌به‌چپ Codex

این مخزن نسخهٔ راست‌به‌چپ اپ دسکتاپ `ChatGPT` (همان `Codex`) را بدون دست‌زدن به اپ اصلی می‌سازد. دامنه فقط جهت متن و فونت است؛ چیدمان `UI`، سایدبار، پنل‌ها، آیکون‌ها و دکمه‌ها فلیپ نمی‌شوند و آینه‌سازی رابط کاربری انجام نمی‌شود.

مبدأ هرگز تغییر نمی‌کند: `/Applications/ChatGPT.app` فقط خوانده می‌شود (اگر نسخهٔ جدید در مسیر دیگری نصب شده باشد، با `CHATGPT_APP_SRC` همان مسیر را بده). خروجی در `~/Applications/ChatGPT-RTL.app` ساخته می‌شود و با `RTL_APP_DEST` جابه‌جا می‌شود. میان‌بر `/Applications/ChatGPT RTL.app` به همین مقصد اشاره می‌کند. شناسهٔ باندل `com.openai.codex` حفظ می‌شود، پس پروفایل، ورود و تاریخچه مشترک است و هرگز نباید نسخهٔ اصلی و نسخهٔ `RTL` را هم‌زمان اجرا کرد.

# Quick start

پیش‌شرط: اپ مبدأ بسته باشد. گارد `pgrep` روی مسیر مبدأ انتخاب‌شده (پیش‌فرض `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT`) باید خالی باشد. فضای آزاد دست‌کم دو برابر `app.asar` لازم است. ابزارهای `node npx codesign plutil shasum find` باید حاضر باشند.

فرمان «پچ کن»:

```sh
./patch-codex-rtl.sh --make-rtl
```

این فرمان ترتیب کامل را اجرا می‌کند: `preflight` سپس `cp -R` و `xattr -cr` سپس بازتولید `payload/codex-rtl.css` و `payload/codex-rtl.js` با `tools/build-css.mjs` و `tools/build-payload.mjs` سپس `npx --yes @electron/asar extract` سپس کپی دو دارایی به `webview/assets` سپس `inject` هر دو `HTML` با معنای `force` سپس اشتقاق `unpack` در ران‌تایم از `app.asar.unpacked` سپس `npx --yes @electron/asar pack --unpack` سپس `verifyRepackInvariant` سپس `updateAsarHash` و `patchFrameworkIntegritySlot` سپس نوشتن `Contents/.codex-rtl-patch.json` قبل از `codesign` سپس `codesign --force --deep --options runtime --sign -` و `codesign --verify --deep --strict` سپس کنترل نسخه و ساخت `ln -sfn`.

اپ اصلی Owl است نه `Electron` استوک: `NSPrincipalClass` مقدار `BrowserCrApplication` است و فریمورک `Codex Framework.framework` است. هیچ `fuse` مربوط به `Electron` در باینری `Contents/MacOS/ChatGPT` نیست، پس روش خاموش‌کردن `fuse` کاربرد ندارد.

دو مُهر باید با هم به‌روز شوند وگرنه اپ با `FATAL .../asar/archive.cc:240 Failed to get integrity for validatable asar archive` می‌میرد: هش `ElectronAsarIntegrity` در `Contents/Info.plist` که `SHA256` بایت‌های `HEADER` فایل `app.asar` است نه کل فایل (در بیلد تأییدشدهٔ `26.1007.30912` مقدار `HEADER` برابر `fc48aaa74816cfddc5f7ae1c2965a36f8ebd8a37465b4bfac27cc216073e222d` و هش کل فایل `75e397e2280dde93b70a85aa926f4282c728eacc84dfeb15ba7fb6ddd84628af` بود) و شکاف داخل باینری فریمورک در بخش `__DATA_CONST,__asar_integrity` با نگهبان `AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A` که مقدار `sha256("Resources/app.asar"+"SHA256"+headerHash)` را نگه می‌دارد. نشان `Contents/.codex-rtl-patch.json` حتماً باید قبل از `codesign` نوشته شود وگرنه مُهر می‌شکند.

مجموعهٔ حداقلی `entitlement` برای امضای `adhoc` چنین است: حذف `com.apple.application-identifier` و `com.apple.developer.team-identifier` و `keychain-access-groups` و `com.apple.developer.aps-environment` و `com.apple.developer.usernotifications.communication` (کلید پنجم از `26.1007` به بعد لازم است وگرنه `amfid` با `Adhoc signed app with restricted entitlements` می‌کشد)، نگه‌داشتن همهٔ `com.apple.security.*` و افزودن `com.apple.security.cs.disable-library-validation`، امضا با `--options runtime`، نتیجهٔ نهایی `flags=0x10002(adhoc,runtime)` و راستی‌آزمایی با `codesign --verify --deep --strict`. بدون این کلید، هر باینری `adhoc` تیم جداگانه محسوب می‌شود و فریمورک با `different Team IDs` بارگذاری نمی‌شود؛ بالادست چون همهٔ اجزا تیم `2DC432GLL2` را دارند به این کلید نیاز نداشت؛ اثر آن با `--deep` سراسری است.

# Patch after update

بعد از هر به‌روزرسانی بالادست، نسخهٔ `RTL` کهنه می‌شود. قلاب خودکار وجود ندارد. کارت بازپچ همان تک‌فرمان است (اگر نسخهٔ جدید در `~/Applications` نصب شده باشد، مبدأ را صریح بده):

```sh
./patch-codex-rtl.sh --make-rtl
CHATGPT_APP_SRC="$HOME/Applications/ChatGPT.app" ./patch-codex-rtl.sh --make-rtl
```

اسکریپت نسخهٔ مبدأ را در شروع می‌خواند (`26.1007.30912` و `20156` در بیلد تأییدشده) و در پایان دوباره `CFBundleShortVersionString` را مقایسه می‌کند؛ اگر وسط کار نسخه عوض شده باشد با پیام `version changed during patch, aborting` و خروج `1` متوقف می‌شود. مقصد قبلی که نشان `Contents/.codex-rtl-patch.json` را دارد پاک و از نو ساخته می‌شود. `glob`های `--unpack` هر بار در ران‌تایم از `find ~/Applications/ChatGPT-RTL.app/Contents/Resources/app.asar.unpacked -type f` با `deriveUnpackGlobs` ساخته می‌شوند و هرگز هاردکد نیستند (در حال حاضر `better-sqlite3` و `node-pty` و `objc-js` و `@worklouder`). تزریق همیشه با لنگر `</head>` است نه نام فایل هش‌دار داخل `./assets/…`.

رفتار زندهٔ تأییدشده: رندرر اصلی `app://-/index.html` و اورلی و `detached` هر سه `dataset.codexRtl="1"` را گزارش کردند؛ پاراگراف فارسی `dir rtl` (حتی وقتی با کلمهٔ لاتین شروع شود، چون `plaintext` حذف شده)، پاراگراف خالص انگلیسی بدون `dir`، `pre` فارسی `ltr` با `monospace`، پاراگراف فارسی با `code` درون‌خطی به‌صورت پاراگراف `rtl` و `code` به‌صورت `ltr`، فونت `p` شامل `Vazirmatn` و کد غیر `Vazirmatn` ماند.

# Verify

سه شاهد که پچ کار کرده است:

```sh
codesign --verify --deep --strict ~/Applications/ChatGPT-RTL.app
./patch-codex-rtl.sh --status
bash -n patch-codex-rtl.sh
```

`codesign --verify --deep --strict` باید خروج `0` بدهد. `--status` نشان `Contents/.codex-rtl-patch.json` را با فیلدهای `sourceVersion` و `sourceBuild` و `asarSha256Before` و `asarSha256After` و `patchedAt` و `payloadSha256` نشان می‌دهد. در بیلد تأییدشده `asarSha256Before` مقدار `75e397e2280dde93b70a85aa926f4282c728eacc84dfeb15ba7fb6ddd84628af` و `asarSha256After` مقدار `385a2e43951346e4a077f7d258c252e9f9c1d097861e71635116bbc714cd4022` بود. راستی‌آزمایی کامل‌تر با `node --test tests/` است که باید بدون خطا پاس شود.

واقعیت `CSP`: مقدار `script-src 'self'` بدون `unsafe-inline` است پس اسکریپت درون‌خطی بلاک می‌شود و فایل هم‌مبدأ خارجی لازم است؛ `style-src` درون‌خطی را می‌پذیرد؛ `font-src 'self' data:` فونت `base64` را مجاز می‌کند. تگ‌های دقیق `<script type="module" src="./assets/codex-rtl.js"></script>` و `<link rel="stylesheet" href="./assets/codex-rtl.css">` داخل `<!--CODEX-RTL:START-->` و `<!--CODEX-RTL:END-->` و بلافاصله قبل از آخرین `</head>` در هر دو ورودی `/webview/index.html` با اندازهٔ `14803` و `/webview/detached-window.html` با اندازهٔ `2847` درج می‌شوند. ریسک `SRI` یا هویت ماژول هش‌دار با هوک `document.documentElement.dataset.codexRtl = "1"` در بیلد زنده اثبات شد؛ اگر پنجره سفید شد، همین نقطه اول بررسی می‌شود.

# Restore

حذف نسخهٔ `RTL` چون اصلی دست‌نخورده است همان حذف است:

```sh
./patch-codex-rtl.sh --restore
```

این فرمان فقط مقصد و میان‌بر را حذف می‌کند، وقتی میان‌بر دقیقاً به همان مقصد اشاره کند. بدون نشان، امتناع می‌کند. مبدأ `/Applications/ChatGPT.app` در همهٔ حالت‌ها سالم می‌ماند.

نکتهٔ `Keychain`: در اولین اجرای نسخهٔ تازه‌امضا، یک‌بار تأیید `Keychain` برای امضای جدید لازم است (نام `Codex Safe Storage`). این رفتار طبیعی است و نشانهٔ خرابی نیست. اگر هر دو نسخه هم‌زمان بالا باشند، پروفایل مشترک خراب می‌شود؛ همیشه یکی را ببند.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

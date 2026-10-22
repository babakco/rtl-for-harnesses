# KNOWLEDGE-BASE

این سند دانش انتقالی برای بازپچ‌های بعدی و اپ‌های مشابه است. بدنه فارسی است و همهٔ مسیرها و فرمان‌ها و شناسه‌ها و مقدارها انگلیسی و عین مقدار واقعی‌اند.

## Owl vs stock Electron

اپ `/Applications/ChatGPT.app` استوک `Electron` نیست. شواهد: `NSPrincipalClass` مقدار `BrowserCrApplication` است، فریمورک `Codex Framework.framework` است، فایل `Resources/owl-electron-app.json` وجود دارد و هیچ `fuse` مربوط به `Electron` در باینری `Contents/MacOS/ChatGPT` نیست. پس روش خاموش‌کردن `fuse` در پچر `Claude` اینجا کاربرد ندارد.

پیامد عملی: هش `ElectronAsarIntegrity` در `Contents/Info.plist` از قبل با هش واقعی ناسازگار بود (در بیلد `26.1007.30912` ثبت‌شده `0ba43368dc2f01fcf2a29c8e02f30cc6bb879ce268c8672734504f791526ce50` در برابر هش `HEADER` واقعی `fc48aaa74816cfddc5f7ae1c2965a36f8ebd8a37465b4bfac27cc216073e222d` و هش کل فایل `75e397e2280dde93b70a85aa926f4282c728eacc84dfeb15ba7fb6ddd84628af`)، یعنی اپ یکپارچگی `asar` را مثل استوک اجرا نمی‌کرد؛ ولی مُهر دوم در فریمورک فعال است و بدون وصلهٔ آن اپ با `FATAL .../asar/archive.cc:240 Failed to get integrity for validatable asar archive` می‌میرد. پس هر دو مُهر باید با هم به‌روز شوند: مُهر `plist` با `updateAsarHash` و هش `HEADER` از `asarHeaderHash`، و مُهر فریمورک با `patchFrameworkIntegritySlot` که مقدار `sha256("Resources/app.asar"+"SHA256"+headerHash)` را در شکاف `__DATA_CONST,__asar_integrity` با نگهبان `AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A` جایگزین می‌کند. نشان `Contents/.codex-rtl-patch.json` حتماً باید قبل از `codesign` نوشته شود وگرنه مُهر می‌شکند و اپ بالا نمی‌آید.

شناسهٔ باندل `com.openai.codex` حفظ می‌شود، پس پروفایل و ورود و تاریخچه مشترک است. هرگز نسخهٔ اصلی و نسخهٔ `RTL` را هم‌زمان اجرا نکن. فرمان «پچ کن» بعد از هر به‌روزرسانی بالادست دقیقاً `./patch-codex-rtl.sh --make-rtl` است (اگر نسخهٔ جدید در `~/Applications` نصب شده باشد: `CHATGPT_APP_SRC="$HOME/Applications/ChatGPT.app" ./patch-codex-rtl.sh --make-rtl`). مبدأ هرگز نوشته نمی‌شود. در اولین اجرای امضای جدید، یک‌بار تأیید `Keychain` با نام `Codex Safe Storage` طبیعی است.

## CSP

مقدار `Content-Security-Policy` در خط `6` هر دو فایل `/webview/index.html` و `/webview/detached-window.html` یکسان است. بندهای کلیدی: `default-src 'none'`، `script-src 'self'` به‌همراه `sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=` و `wasm-unsafe-eval` بدون `unsafe-inline`، `style-src 'self' 'unsafe-inline'`، `font-src 'self' data:`.

نتیجه: اسکریپت درون‌خطی بلاک می‌شود و فایل خارجی هم‌مبدأ لازم است؛ به همین دلیل تگ دقیق `<script type="module" src="./assets/codex-rtl.js"></script>` با مسیر نسبی `./assets/…` به‌کار می‌رود. `CSS` درون‌خطی مجاز است ولی ما فایل خارجی `<link rel="stylesheet" href="./assets/codex-rtl.css">` را تزریق می‌کنیم. فونت `base64` به‌صورت `data:font/woff2;base64,...` مجاز است چون `font-src` مقدار `data:` را دارد. تزریق درست قبل از آخرین `</head>` انجام می‌شود تا بعد از استایل‌های پایه بیاید. نشان‌ها دقیقاً `<!--CODEX-RTL:START-->` و `<!--CODEX-RTL:END-->` هستند. ریسک `SRI` یا هویت ماژول هش‌دار با هوک `document.documentElement.dataset.codexRtl = "1"` در بیلد زنده اثبات شد. دربارهٔ `CSP` نشستی که ممکن است در `main process` تنظیم شود، مدرک مستقیمی در کاوش نیست؛ این مورد «نامشخص» است چون فقط `CSP` داخل `HTML` خوانده شد و دلیل آن محدودبودن کاوش به متن دو ورودی است.

## Entitlements

خروجی `codesign -d --entitlements :-` گرفته می‌شود، بعد با `stripEntitlements` و `prepareEntitlements` در `tools/sign.mjs` پنج کلید `com.apple.application-identifier` و `com.apple.developer.team-identifier` و `keychain-access-groups` و `com.apple.developer.aps-environment` و `com.apple.developer.usernotifications.communication` حذف می‌شوند و همهٔ `com.apple.security.*` نگه داشته می‌شوند و `com.apple.security.cs.disable-library-validation` افزوده می‌شود. امضا با `codesign --force --deep --options runtime --sign -` است و راستی‌آزمایی نهایی `codesign --verify --deep --strict` است. نتیجهٔ نهایی `flags=0x10002(adhoc,runtime)` با `Signature=adhoc` است.

چرا این کلید لازم است: امضاهای `adhoc` هر باینری را تیم جداگانه می‌کنند، پس بدون آن فریمورک با خطای `mapping process and mapped file (non-platform) have different Team IDs` و خروج `134` بارگذاری نمی‌شود؛ بالادست چون همهٔ اجزا تیم `2DC432GLL2` را دارند به این کلید نیاز نداشت؛ اثر آن با `--deep` سراسری است. نشانهٔ خرابی `amfid` متفاوت است: گزارش `not valid: "The file is adhoc signed but contains restricted entitlements"` در `log` و مرگ خاموش با خروج `137` و بدون پنجره، در حالی که `codesign --verify --deep --strict` ممکن است همچنان `valid on disk` بدهد. پس `verify` به‌تنهایی کافی نیست.

## Unpack

اگر `repack` بدون `glob` انجام شود، ماژول‌های `native` داخل `asar` می‌روند و اپ بالا نمی‌آید. `glob`ها باید در ران‌تایم از خروجی `find .../Contents/Resources/app.asar.unpacked -type f` با `deriveUnpackGlobs` ساخته شوند و هرگز هاردکد نباشند. در حال حاضر چهار خانواده دیده می‌شوند: `better-sqlite3` و `node-pty` و `objc-js` و `@worklouder`. عبارت نهایی به شکل `**/{...}` به `npx --yes @electron/asar pack --unpack` داده می‌شود چون تطبیق در `asar` روی مسیر مطلق با `matchBase` انجام می‌شود و `glob` نسبی تنها چیزی را جدا نمی‌کند.

`verifyRepackInvariant` سه شرط را می‌سنجد: مجموعهٔ مسیرها جز دو ورودی جدید `/webview/assets/codex-rtl.js` و `/webview/assets/codex-rtl.css` یکسان بماند، پرچم `unpacked` بایت‌به‌بایت یکسان بماند و اندازهٔ هر مسیر دیگر جز رشد دقیق دو `HTML` به اندازهٔ `injectionByteLength()` یعنی `158` بایت تغییر نکند. رفتار زندهٔ تأییدشده با همین زنجیره به‌دست آمد: رندرر اصلی `app://-/index.html` و اورلی و `detached` هر سه `dataset.codexRtl="1"`، پاراگراف فارسی `dir rtl`، پاراگراف خالص انگلیسی `ltr`، `pre` فارسی `ltr` با `monospace`، پاراگراف فارسی با `code` درون‌خطی به‌صورت پاراگراف `rtl` و `code` به‌صورت `ltr`، فونت `p` شامل `Vazirmatn` و کد غیر `Vazirmatn`.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

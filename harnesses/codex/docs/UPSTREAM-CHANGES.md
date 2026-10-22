# UPSTREAM-CHANGES

این سند راهبری بررسی تغییرات بالادست `OpenAI` است. بدنه فارسی است و همهٔ مسیرها و فرمان‌ها و شناسه‌ها و مقدارها انگلیسی و عین مقدار واقعی‌اند.

## What to check first

بعد از هر به‌روزرسانی مبدأ `/Applications/ChatGPT.app`، همین ترتیب را بررسی کن و بعد `./patch-codex-rtl.sh --make-rtl` را اجرا کن:

```sh
./patch-codex-rtl.sh --dry-run
./patch-codex-rtl.sh --status
npx --yes @electron/asar list --is-pack /Applications/ChatGPT.app/Contents/Resources/app.asar | head -5
find /Applications/ChatGPT.app/Contents/Resources/app.asar.unpacked -type f | head -5
codesign -d --entitlements :- /Applications/ChatGPT.app | head -20
```

نسخهٔ `CFBundleShortVersionString` و `CFBundleVersion` را از `Contents/Info.plist` با `plutil -extract` بخوان و با نشان `Contents/.codex-rtl-patch.json` یعنی فیلدهای `sourceVersion` و `sourceBuild` و `asarSha256Before` و `asarSha256After` مقایسه کن. اگر نسخه وسط پچ عوض شود، اسکریپت با `version changed during patch, aborting` و خروج `1` می‌ایستد. هرگز اصلی و `RTL` را هم‌زمان اجرا نکن چون شناسهٔ `com.openai.codex` مشترک است. مبدأ هرگز نوشته نمی‌شود و مقصد `~/Applications/ChatGPT-RTL.app` است.

## Fragile invariants

هر ردیف محل نگاه و اثر خرابی را دارد. همهٔ مقدارهای زیر از بیلد تأییدشده با `26.1002.52244` و `13536` آمده‌اند.

- نام دارایی‌های هش‌دار: کجا نگاه کنی: `webview/assets` داخل `asar` و تگ‌های `src="./assets/…"` در `/webview/index.html` با اندازهٔ `14803` و `/webview/detached-window.html` با اندازهٔ `2847`. چه می‌شکند: اگر بالادست نام `app-shared-f2d570e85ceb.css` یا `JS` هش‌دار را عوض کند، تزریق با نام ثابت می‌شکند؛ به همین دلیل تزریق همیشه با لنگر آخرین `</head>` و نشان‌های `<!--CODEX-RTL:START-->` و `<!--CODEX-RTL:END-->` است و تگ‌های دقیق `<script type="module" src="./assets/codex-rtl.js"></script>` و `<link rel="stylesheet" href="./assets/codex-rtl.css">` باید همان بمانند؛ خرابی به‌صورت پنجرهٔ سفید یا رد `SRI` دیده می‌شود و هوک `document.documentElement.dataset.codexRtl = "1"` آن را اثبات می‌کند.
- `CSP`: کجا نگاه کنی: خط `6` هر دو `HTML` با بندهای `script-src 'self'` بدون `unsafe-inline` و `style-src 'self' 'unsafe-inline'` و `font-src 'self' data:`. چه می‌شکند: اگر `script-src` سفت‌تر شود یا `font-src` مقدار `data:` را بردارد، فایل خارجی یا فونت `base64` بلاک می‌شود؛ دربارهٔ `CSP` نشستی در `main process` مدرک مستقیمی نیست و «نامشخص» است چون فقط `HTML` خوانده شد.
- چیدمان `asar`: کجا نگاه کنی: خروجی `npx --yes @electron/asar list --is-pack` و ریشه‌های `/.vite` و `/node_modules` و `/webview` و `package.json` با `main` مقدار `.vite/build/early-bootstrap.js`. چه می‌شکند: اگر ورودی رندرر از `/webview/index.html` جابه‌جا شود یا `HTML` دیگری اضافه شود، `inject` و `ALLOWED_DIFFERENCES` ناکامل می‌مانند و `verifyRepackInvariant` با `missing path` یا `unexpected added paths` می‌ایستد.
- قالب مُهر فریمورک: کجا نگاه کنی: بخش `__DATA_CONST,__asar_integrity` در `Contents/Frameworks/Codex Framework.framework/Codex Framework` با نگهبان `AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A` و فرمول `sha256("Resources/app.asar"+"SHA256"+headerHash)`. چه می‌شکند: اگر نسخه یا آفست شکاف عوض شود، `patchFrameworkIntegritySlot` با `sentinel not found` یا `offset mismatch` می‌ایستد و بدون وصله اپ با `FATAL .../asar/archive.cc:240 Failed to get integrity for validatable asar archive` می‌میرد. هش `plist` همیشه هش `HEADER` است نه کل فایل (قدیمی `b0d442ed63026a266e9f86df139bcafb9dcafe628b7065ea0473fe82760a82f0` در برابر کل فایل `40efd7acdf03a24817fcd7f35684fc2173b154df06774243cb4ab227e36fa915`).
- مجموعهٔ `entitlement`: کجا نگاه کنی: `codesign -d --entitlements :-` و توابع `stripEntitlements` و `prepareEntitlements` در `tools/sign.mjs`. چه می‌شکند: اگر بالادست کلید محدودشدهٔ جدید بیاورد، `amfid` با `not valid: "The file is adhoc signed but contains restricted entitlements"` و خروج `137` می‌کشد؛ حداقل فعلی حذف `com.apple.application-identifier` و `com.apple.developer.team-identifier` و `keychain-access-groups` و `com.apple.developer.aps-environment` و نگه‌داشتن همهٔ `com.apple.security.*` و افزودن `com.apple.security.cs.disable-library-validation` با `--options runtime` و نتیجهٔ `flags=0x10002(adhoc,runtime)` است.
- فهرست `unpack`: کجا نگاه کنی: `find .../Contents/Resources/app.asar.unpacked -type f` و `deriveUnpackGlobs` در `tools/repack.mjs`. چه می‌شکند: اگر خانوادهٔ `native` جدیدی جز `better-sqlite3` و `node-pty` و `objc-js` و `@worklouder` بیاید و هاردکد شده باشد، اپ بالا نمی‌آید؛ عبارت باید هر بار به شکل `**/{...}` ساخته شود و `verifyRepackInvariant` پرچم `unpacked` را بایت‌به‌بایت می‌سنجد.
- نشان و ترتیب مُهر: کجا نگاه کنی: `MARKER="Contents/.codex-rtl-patch.json"` در `patch-codex-rtl.sh` و تست‌های `tests/sign-order.test.mjs`. چه می‌شکند: اگر نشان بعد از `codesign` نوشته شود، مُهر می‌شکند؛ ترتیب درست `asarHeaderHash` سپس `updateAsarHash` سپس `patchFrameworkIntegritySlot` سپس نوشتن نشان سپس `codesign --force --deep --options runtime --sign -` سپس `codesign --verify --deep --strict` است.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

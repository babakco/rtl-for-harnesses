# Cline RTL — راهنمای ایجنت‌ها

این پوشه یک «پچ + اسکریپت ساخت» است که از روی نسخه اصلی دسکتاپ Cline، نسخه فارسی‌راست‌چین **Cline RTL** را می‌سازد. سورس Cline اینجا نگهداری نمی‌شود؛ فقط پچ و اسکریپت.

## راه‌حل اصلی: ساخت از سورس

نسخه کامل و کارای RTL **فقط** با بیلد از سورس ساخته می‌شود. راه دیگری وجود ندارد.

```bash
./build-rtl.sh --from-installed --out ~/Applications   # روند اصلی: نسخه استوک نصب‌شده را بخوان، همان تگ را با پچ RTL بساز
```

پرچم‌های کمکی: `--tag desktop-vX.Y.Z` (تگ مشخص)، `--patch-only` (فقط اعمال پچ، بدون بیلد)، `--src DIR` (چک‌اوت موجود)، `--workdir DIR` (کش سورس سفارشی)، `--fresh` (شروع تمیز).

- سورس در کش ماندگار `~/.cache/cline-rtl/cline` نگه داشته می‌شود تا بیلدهای بعدی افزایشی (سریع) باشند.
- با `--from-installed` نسخه از `Info.plist` اپ استوک خوانده و تگ `desktop-vX.Y.Z` ساخته می‌شود؛ در غیر این صورت کامیت پیش‌فرض زیر استفاده می‌شود.
- ابزار کمکی جدا (بدون RTL، بدون بیلد): `patch-installed.sh` فقط یک کپی با هویت جدا (نام/باندل‌آیدی) از اپ استوک می‌سازد.

## خروجی‌ها

- `cline-rtl.patch` — پچ گیت (یونیفاید دیف)؛ روی ریشه ریپوی `cline/cline` اعمال می‌شود.
- `build-rtl.sh` — دریافت سورس، اعمال پچ، بیلد و نصب `Cline RTL.app` در خروجی (پیش‌فرض `~/Applications`).
- `patch-installed.sh` — کپی سریع اپ استوک با هویت جدا و امضای ad-hoc (رابط استوک، بدون RTL).

## نسخه مبنا

- اپ نصب‌شده: `/Applications/Cline.app` — دست‌نخورده باقی می‌ماند.
- آپ‌استریم: `https://github.com/cline/cline.git`؛ کامیت پیش‌فرض `476b165b97aaafb47ee8a82b093f25d5611395d9` (تگ `desktop-v0.0.43`).
- نکته نگهداری: خط `‎"version"‎` در `tauri.conf.json` با هر ریلیز عوض می‌شود و قبلاً پچ را می‌شکست؛ `build-rtl.sh` حالا آن یک خط context را خودکار با نسخه چک‌اوت همگام می‌کند، پس پچ عملاً نسخه‌مستقل است.
- ریبیس `0.0.43` → `0.0.45`: آپ‌استریم در `webview/components/ui/markdown.tsx` تابع `MemoizedMarkdown` را بازنویسی کرد و خروجی را داخل یک `<div className="contents">` با هندلرهای capture لینک دیاگرام پیچید. پچ RTL حالا روی همان قاب سوار شده — یک div با `className="contents cline-rtl-markdown"` که هم `ref`/`MutationObserver` مربوط به RTL را دارد و هم `onClickCapture`/`onPointerDownCapture` اصلی را. باقی هفت فایل بدون تغییر ساختاری نشستند.
- اصلاح `build-rtl.sh`: ترتیب `git reset --hard HEAD` + `git clean -fd` قبل از `git checkout "$REF"` انجام می‌شود؛ پیش‌تر leftover پچ قبلی روی کش، هنگام عوض شدن تگ، `checkout` را با خطای «local changes would be overwritten» می‌شکست.
- سورس اپ دسکتاپ: `apps/examples/desktop-app` — معماری: شل Tauri (راست، `src-tauri`) + فرانت Next.js (`webview/`) + بک‌اند سایدکار Bun (`sidecar/`).
- پکیج UI مشترک: `sdk/packages/ui` (تم، `agent-chat.css` ،`markdown.css`).

## چرا پچ سورسی، نه باینری

- فرانت‌اند داخل باینری `cline-app` به‌صورت فشرده جاسازی شده (فقط نام چانک‌های `_next/static` به‌صورت متن دیده می‌شود؛ نام کلاس‌هایی مثل `cline-markdown` اصلاً در باینری نیست). پس دست‌کاری باینری شکننده است.
- راه درست: پچ روی سورس باز + بیلد مجدد Tauri.

## منطق RTL (خلاصه رفتار خواسته‌شده)

1. هر جمله/پاراگراف از متن کاربر یا پاسخ مدل که **هرجای آن** حتی یک کاراکتر فارسی باشد، کل آن بلوک RTL نمایش داده می‌شود — حتی اگر با انگلیسی یا علائم شروع شده باشد.
2. فونت همه نوشته‌های کاربر و پاسخ‌ها **وزیرمتن** است.

## پیاده‌سازی (فایل‌های داخل پچ)

- `webview/lib/rtl.ts` (جدید، بدون وابستگی به React):
  - `containsPersian()` با رجکس صریح `/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿‌‍]/` — حتماً با escapeهای `\u` نگهش دار، نه کاراکتر خام (نامرئی/شکننده است).
  - `applyRtlToMarkdownRoot()` روی `p, li, h1-h6, blockquote, td, th` می‌چرخد؛ بلوک دارای فارسی `dir=rtl` و بقیه صراحتاً `dir=ltr` می‌گیرند؛ زیر‌درخت `pre, code, [data-streamdown='code-block']` رد می‌شود (کد همیشه LTR).
  - نکته: `dir="auto"` ی موجود Streamdown فقط حرف قوی اول را می‌بیند و برای همین نیازمندی کافی نیست؛ منطق بالا جایگزین آن در سطح بلوک است.
- `webview/components/ui/markdown.tsx`: خروجی Streamdown در `div.cline-rtl-markdown` پیچیده شده؛ یک `useEffect` روی `[content, streaming]` + یک `MutationObserver` (برای استریم زنده) `applyRtlToMarkdownRoot` را صدا می‌زنند. همه پیام‌های کاربر/دستیار/reasoning از همین کامپوننت می‌گذرند.
- `webview/components/views/chat/chat-input-bar.tsx`: کامپوننت `<AgentComposerTextarea>` (از `sdk/packages/ui`) صفت‌ها را pass-through می‌کند، پس فقط `className="cline-rtl-composer"` و `dir={containsPersian(promptInput) ? "rtl" : "ltr"}` به آن اضافه شده — دیگر لازم نیست کلاس‌های استایل کامپوزر دستی نوشته شوند (خود کامپوننت آن‌ها را دارد).
- `webview/app/rtl.css` (جدید) + یک `@import "./rtl.css"` در `globals.css`: تعریف `@font-face` برای Vazirmatn Variable + فونت روی کامپوزر و `.cline-markdown`، `text-align: right` برای `[dir="rtl"]`، و برگرداندن `var(--font-mono)` روی `pre/code` بلوک‌های کد.
- **فونت وزیرمتن بدون وابستگی npm:** عمداً `@fontsource-variable/vazirmatn` در `package.json` اضافه نمی‌شود. هر وابستگی جدیدی `bun.lock` آپ‌استریم را بی‌اعتبار می‌کند و bun مجبور به re-resolve می‌شود؛ آن موقع نسخه‌های `@ai-sdk/*` بالا می‌روند و `bun run build:sdk` با خطاهای نوع (`TS2322` در `sdk/packages/llms`) می‌شکند. به‌جایش `build-rtl.sh` سه فایل `woff2` را از jsdelivr در `webview/public/fonts/` دانلود و با sha256 اعتبارسنجی می‌کند؛ `rtl.css` با `url("/fonts/...")` به آن‌ها اشاره می‌کند (در بیلد نهایی داخل باینری `cline-app` جاسازی می‌شوند).
- هویت جدا: `tauri.conf.json` (`productName: "Cline RTL"`، `identifier: "bot.cline.app.rtl"`، تیتر پنجره، `updater.active: false` تا آپدیت رسمی نسخه استوک روی RTL ننشیند) + `scripts/package-desktop.ts` (`APP_NAME = "Cline RTL"` چون مسیر باندل از آن ساخته می‌شود). نسخه `version` در `tauri.conf.json` عمداً دست‌نخورده می‌ماند (هم‌نسخه با آپ‌استریم).
- `webview/lib/rtl.test.ts`: تست vitest فقط برای `containsPersian` (محیط تست ریپو `node` است).

## دامنه آگاهانه خارج از پچ

فیلدهای تنظیمات (کلید API، URL) و کروم انگلیسی UI عمداً LTR مانده‌اند؛ جدول‌ها فقط در سطح سلول (`td/th`) می‌چرخند.

## ترتیب بیلد (ترتیب مهم است)

1. دریافت سورس در کش ماندگار `~/.cache/cline-rtl/cline` (یا `--src`) + `git fetch` تگ/کامیت + `git checkout` + `git reset --hard` و `git clean -fd` (کش‌های بیلد مثل `node_modules` و `target/` چون ignore هستند حفظ می‌شوند).
2. `git apply --check` سپس `git apply`؛ در صورت شکست، تلاش `git apply --3way` وگرنه خطای «پچ نیاز به rebase دستی دارد».
3. دانلود سه `woff2` وزیرمتن به `webview/public/fonts/` با اعتبارسنجی sha256 (تابع `fetch_fonts` در اسکریپت)
4. `bun install` (ریشه مونورپو) — **هیچ وابستگی جدیدی به `package.json` اضافه نکن**، وگرنه `bun.lock` بی‌اعتبار و re-resolve می‌شود (بیلد SDK با خطای نوع می‌شکند)
5. `bun run build:sdk` — **اجباری قبل از هرچیز**؛ چون `dist` پکیج‌ها (مثل `@cline/shared/dist`) ساخته نشده باشد، بیلد `@cline/ui` با `TS2307: Cannot find module '@cline/shared/browser'` می‌افتد و به‌تبع آن خطای کاذب `TS7030` در `generated-media.tsx` هم ظاهر می‌شود (با ساخته شدن dist هر دو محو می‌شوند — قبلاً راستی‌آزمایی شد).
6. `ALLOW_UNSIGNED_MAC=1 bun run package:desktop:mac` در `apps/examples/desktop-app` (بیلد کامل وب + سایدکار + `tauri build` + امضای ad-hoc + زیپ در `dist/desktop/`). بدون اعتبار Developer ID حتماً `--allow-unsigned-mac` لازم است. گام `bundle_dmg.sh` گاهی در محیط headless شکست می‌خورد؛ اسکریپت در آن حالت خودش `.app` را ad-hoc امضا و نصب می‌کند (DMG لازم نیست).

## راستی‌آزمایی‌های انجام‌شده (روی 0.0.43)

- منطق `containsPersian` با vitest (۷ تست) — سبز.
- `git apply --check` پچ روی چک‌اوت تمیز `desktop-v0.0.43` — تمیز اعمال شد.
- بیلد کامل موفق: `Cline RTL.app` نسخه `0.0.43` با `Identifier = bot.cline.app.rtl`، امضای ad-hoc معتبر، خروجی `webview/out` شامل `cline-rtl-markdown` و `fonts/vazirmatn-*.woff2`، و مسیرهای `/fonts/vazirmatn-*.woff2` داخل باینری `cline-app` جاسازی شده‌اند.
- اپ استوک `/Applications/Cline.app` دست‌نخورده ماند (`0.0.43`، ‏`bot.cline.app`).

## اجرای اول روی مک

امضا ad-hoc و نوتارایزنشده است: بار اول با **راست‌کلیک > Open** باز شود. ابزارهای لازم برای بیلد: `git bun rustc xcodebuild curl` (اسکریپت خودش چک می‌کند). بیلد کامل (به‌خصوص کامپایل اول Rust) طولانی است؛ در پس‌زمینه اجرا شود.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

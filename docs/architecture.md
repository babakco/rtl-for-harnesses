# معماری

## اصل طراحی: یک هارنس، یک پوشه

این مخزن یک «موتور RTL مشترک» نمی‌سازد. هر هارنس منطق آزموده‌شدهٔ خودش را
نگه می‌دارد، چون ساختار DOM، نسخهٔ Electron، سیاست CSP، نحوهٔ امضا و حتی
رفتار virtualized list در برنامه‌ها متفاوت است. یک موتور مشترک یعنی یک
رگرسیون در یک برنامه به همه سرایت می‌کند.

```text
manifest.json
   │
   ├── harnesses/deepseek-harness/   ← asar + payload
   ├── harnesses/minimax-code/       ← asar + preload
   ├── harnesses/opencode/           ← asar
   ├── ...
   └── harnesses/github-copilot/     ← dylib (in-place)
```

`manifest.json` تنها منبع حقیقت است: slug، مسیر برنامه، خروجی، روش تزریق،
پروفایل، دستور ساخت، دستور تأیید، تست و بازگردانی. CLI هرگز دستور را از
README نمی‌خواند؛ README فقط توضیح انسانی همان داده است.

## روش‌های تزریق

### ۱. Electron asar

برنامه‌های DeepSeek Harness، OpenCode، WorkBuddy AI، ZCode، Freebuff و
Xiaomi MiMo از این خانواده‌اند. مراحل کلی:

1. کپی برنامهٔ اصلی به مسیر خروجی (حالت پیش‌فرض).
2. باز کردن `app.asar` یا `app.asar` داخل framework.
3. تزریق CSS و JS در نقطهٔ ورود renderer.
4. بازنویسی asar و به‌روزرسانی `ElectronAsarIntegrity` در `Info.plist`.
5. امضای ad-hoc و تأیید.

در OpenCode خروجی `OpenCode-RTL.app` ساخته می‌شود. مسیر `RTL-2` در کد باقی
مانده اما build پیش‌فرض نیست. در ZCode و Freebuff شناسهٔ bundle عوض می‌شود
تا از برنامهٔ اصلی قابل تفکیک باشد؛ در WorkBuddy و MiMo شناسه یکسان می‌ماند
و پروفایل مشترک است.

### ۲. Electron preload

MiniMax Code، Kimi و Antigravity از preload استفاده می‌کنند. مزیت این روش
این است که می‌توان قبل از بارگذاری renderer یک hook نصب کرد و CSP را بدون
دست‌زدن به کل asar باز کرد. payload شامل CSS و JS است؛ منطق LTR برای کد،
ترمینال، URL و فرمول حفظ می‌شود.

Antigravity علاوه بر preload، یک CSS جداگانه دارد و با `--no-launch` اجرا
می‌شود تا CLI هیچ برنامه‌ای را خودکار باز نکند.

### ۳. جراحی هدفمند

WorkBuddy AI و Qoder از تغییرات هدفمند استفاده می‌کنند. در این خانواده،
تزریق سراسری CSS کافی نیست: لیست‌های virtualized، CodeMirror، منوهای
context و markdown blockها باید جداگانه مدیریت شوند. پچ عمداً کوچک است تا
بعد از آپدیت upstream قابل بازبینی بماند.

### ۴. Framework asar (Codex / ChatGPT)

Codex از asar داخل framework استفاده می‌کند و به `ElectronAsarIntegrity`،
entitlements و امضای درست حساس است. اسکریپت ابتدا integrity را بازسازی
می‌کند، سپس امضا می‌کند و در آخر تأیید. خروجی در
`$HOME/Applications/ChatGPT-RTL.app` است.

### ۵. Rust native (Zed)

Zed یک برنامهٔ Rust است و RTL واقعی فقط با build از سورس به‌دست می‌آید.
`scripts/build-zed-rtl.sh` مخزن Zed را در یک مسیر cache بیرون از این مخزن
کلون/به‌روزرسانی می‌کند، patchها را اعمال می‌کند و `Zed-RTL.app` می‌سازد.
`scripts/make-rtl-app-from-installed.sh` فقط نام/فونت را عوض می‌کند و
**RTL پاراگراف اضافه نمی‌کند**؛ این یک fallback ظاهری است، نه روش پیش‌فرض.

### ۶. Tauri source (Cline)

Cline با Tauri ساخته می‌شود. `build-rtl.sh --from-installed` نسخهٔ نصب‌شده
را مبنا می‌گیرد، سورس را از شبکه می‌گیرد و frontend را با patch راست‌چین
می‌سازد. این مسیر به Bun، Rust، Xcode CLT و شبکه نیاز دارد و طولانی است.
خروجی پیش‌فرض `$HOME/Applications/Cline RTL.app` است.

### ۷. dylib / WebKit (GitHub Copilot)

GitHub Copilot تنها هارنس درجا است. یک dylib به WebKit تزریق می‌شود تا
renderer را در سطح فریم‌ورک RTL کند. این روش به معماری arm64 وابسته است؛
روی Intel باید dylib با `build.sh` بازسازی شود. CLI بدون
`--allow-in-place` این هارنس را اجرا نمی‌کند.

## چرا کپی، نه پچ درجا؟

- برنامهٔ اصلی دست‌نخورده می‌ماند و auto-update آن نمی‌شکند.
- rollback فقط حذف یک `.app` است.
- دو نسخه قابل مقایسه‌اند.
- پروفایل مشترک در README هر هارنس هشدار داده می‌شود.

تنها استثنا GitHub Copilot است، چون تزریق dylib در همان bundle نصب‌شده
معنادار است. برای آن پشتیبان اجباری است.

## امضا و Gatekeeper

همهٔ buildها امضای ad-hoc می‌گیرند. این امضا برای اجرای محلی روی همان Mac
کافی است، اما notarized نیست. macOS ممکن است در اولین اجرا هشدار نشان دهد.
راه‌حل امن: از System Settings > Privacy & Security اجازهٔ اجرا بدهید؛
غیرفعال کردن Gatekeeper برای کل سیستم توصیه نمی‌شود. جزئیات در
[`safety.md`](safety.md).

## محدودیت‌ها

- فقط macOS.
- نسخه‌های upstream تغییر می‌کنند؛ `testedVersion` تضمین آینده نیست.
- پروفایل مشترک یعنی هم‌زمان اجرا نکنید.
- buildهای سورس (Zed/Cline) به شبکه و ابزارهای سنگین نیاز دارند.
- تست‌های خودکار، رفتار واقعی همهٔ selectorها را پوشش نمی‌دهند؛ تأیید
  انسانی بعد از هر آپدیت upstream لازم است.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

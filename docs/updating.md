# به‌روزرسانی و بازسازی

## قاعدهٔ کلی

هر بار برنامهٔ اصلی آپدیت می‌شود، نسخهٔ RTL را **از نسخهٔ اصلی جدید** بازسازی
کنید. پچ‌ها روی نسخهٔ قدیمی نمی‌مانند؛ build از source app تازه شروع می‌شود.

```bash
# 1. برنامهٔ اصلی را آپدیت کنید و ببندید
# 2. وضعیت را ببینید
./rtl-harness detect
./rtl-harness info <slug>

# 3. build و verify
./rtl-harness build <slug> --yes
./rtl-harness verify <slug>

# 4. اجرا
open "/Applications/<RTL>.app"
```

## version drift

`testedVersion` نسخه‌ای است که پروژهٔ منبع مستند کرده. `lastVerifiedVersion`
نسخه‌ای است که در این مخزن واقعاً build/verify شده. اگر نسخهٔ نصب‌شدهٔ شما
جدیدتر است، `detect` وضعیت `version-drift` را نشان می‌دهد.

این وضعیت:

- **هشدار** است، نه خطا؛
- مجوز خودکار برای تغییر selectorها یا regexها نیست؛
- اگر build موفق شد و `verify` پاس شد، می‌توانید در گزارش خودتان آن را
  به‌عنوان «تأیید محلی» ثبت کنید؛
- اگر build شکست خورد یا صفحه سفید شد، patch نیاز به به‌روزرسانی دارد.

## بعد از آپدیت هر خانواده

| خانواده | نکته |
|---|---|
| Electron asar | asar دوباره باز/بسته می‌شود؛ `ElectronAsarIntegrity` و امضا بازسازی شوند |
| Electron preload | مسیر preload و CSP را بررسی کنید؛ ممکن است نام فایل عوض شده باشد |
| Framework asar (Codex) | integrity، entitlements و ترتیب امضا حساس است |
| Rust (Zed) | مخزن/تگ Zed ممکن است عوض شده باشد؛ patchها را دوباره اعمال کنید |
| Tauri (Cline) | نسخهٔ 0.0.45 مبنای patch است؛ نسخهٔ جدید ممکن است patch جدید بخواهد |
| dylib (Copilot) | بعد از آپدیت، dylib باید دوباره تزریق و امضا شود |

## rollback

| وضعیت | کار |
|---|---|
| خروجی RTL خراب است | خروجی را به سطل زباله ببرید و دوباره build کنید |
| برنامهٔ اصلی خراب شده (Copilot) | `cd harnesses/github-copilot && bash uninstall.sh` |
| MiniMax/Kimi | `bash restore.sh` در پوشهٔ هارنس |
| Claude با `--install` | `bash patch-live.sh --restore` |
| پروفایل مشترک خراب شده | هر دو برنامه را ببندید؛ از backup پروفایل استفاده کنید |

## self-update

نسخه‌های RTL تلاش می‌کنند self-updater را خاموش کنند تا آپدیت upstream پچ را
پاک نکند. با این حال، رفتار هر برنامه متفاوت است:

- اگر نسخهٔ RTL خودش را آپدیت کرد، `verify` را دوباره اجرا کنید.
- اگر `wrong-bundle-id` یا صفحه سفید دیدید، build را از نسخهٔ اصلی تکرار
  کنید.
- برای OpenCode، build پیش‌فرض فقط `OpenCode-RTL.app` است؛ RTL-2 را دستی
  و جداگانه بسازید.

## بعد از آپدیت macOS

- ممکن است امضای ad-hoc همچنان معتبر باشد؛ با `verify` چک کنید.
- اگر Gatekeeper سخت‌گیرتر شد، از System Settings اجازه بدهید.
- اگر Xcode CLT آپدیت شد، buildهای Zed/Cline را دوباره تست کنید.

## ثبت شواهد

بعد از هر بازسازی مهم، در `docs/verification.md` (یا گزارش محلی خودتان)
این موارد را ثبت کنید:

- تاریخ
- macOS version و معماری
- slug
- نسخهٔ source و output
- نتیجهٔ `verify`
- نتیجهٔ اجرای واقعی
- هشدارها/محدودیت‌ها

مسیر شخصی یا token ثبت نکنید.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

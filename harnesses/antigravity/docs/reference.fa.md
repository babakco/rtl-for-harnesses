# Antigravity RTL — نسخه راست‌به‌چپ فارسی

کپی مستقل `Antigravity.app` با نمایش درست متن‌های مختلط فارسی/انگلیسی:
فونت **Vazirmatn** و قانون «یک کاراکتر فارسی → کل پاراگراف RTL» (حتی با شروع انگلیسی).
نسخه اصلی دست نمی‌خورد؛ پچ با یک دستور قابل اعمال مجدد است.

## شروع سریع

پیش‌نیاز: نصب فونت **Vazirmatn** در سیستم + `node`/`npx`.

```bash
tools/apply-rtl-patch.sh
```

بعد از هر آپدیت Antigravity: اول نسخه اصلی را آپدیت کنید، بعد همین دستور را دوباره اجرا کنید.

راهنمای کامل فارسی (یافته‌های فنی، عیب‌یابی، چک‌لیست تست): [`docs/FA-rtl-guide.md`](FA-rtl-guide.md)

تست‌ها: `node --test tests/` و `bash tests/e2e-rtl-patch.sh`
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

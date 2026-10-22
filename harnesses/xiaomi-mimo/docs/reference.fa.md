# Xiaomi MiMo AI — Persian/RTL patch (macOS)

Builds a patched **copy** of the installed Xiaomi MiMo AI app:

- `/Applications/Xiaomi MiMo AI.app` — original, never touched
- `/Applications/Xiaomi MiMo AI-RTL.app` — patched daily driver: any paragraph
  containing Persian renders RTL in Vazirmatn (user input + model output),
  pure-English stays LTR, code/terminal/math untouched.

```bash
npm test                      # behavioural tests for the payload
bash patch-xiaomi-mimo-rtl.sh # fully automatic: copy → patch asar → plist →
                              # ad-hoc sign → verify. Re-run after each
                              # official update of the original app.
```

**راهنمای کامل فارسی برای ایجنت بعدی: [`GUIDE.md`](../README.md)** — معماری،
یافته‌های مهندسی معکوس، کدام قسمت‌ها تغییر کردند، عیب‌یابی، چک‌لیست به‌روزرسانی.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

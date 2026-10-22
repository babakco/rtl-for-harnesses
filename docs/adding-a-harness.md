# افزودن هارنس

## اصل

هر هارنس یک پوشهٔ مستقل زیر `harnesses/<slug>/` است. کد آزموده‌شده را کپی
کنید، بازنویسی نکنید. تنها تغییرات مجاز: حذف دادهٔ شخصی، حذف فایل غیرمرتبط،
اصلاح لینک/مسیر و حذف build artifact.

## ساختار پیشنهادی

```text
harnesses/<slug>/
  README.md              # فارسی، با دستورهای دقیق
  docs/                  # مستندات منبع، پاکسازی‌شده
  assets/                # CSS/JS/فونت
  payload/               # فقط اگر جدا لازم است
  tests/                 # تست‌های سبک، بدون شبکه
  <entry script>
```

فایل‌های `node_modules`، `.venv`، `build`، `dist`، `target`، `__pycache__`،
`.git`، `.env` و فایل‌های backup را کپی نکنید.

## manifest

ورودی جدید در `manifest.json` با این فیلدها:

```json
{
  "slug": "my-harness",
  "name": "My Harness",
  "vendor": "Vendor",
  "appPath": "/Applications/My Harness.app",
  "appBundleId": "com.example.myharness",
  "outputBundleId": "com.example.myharness.rtl",
  "outputPath": "/Applications/My Harness-RTL.app",
  "additionalOutputs": [],
  "method": "electron-asar",
  "profile": "shared",
  "inPlace": false,
  "requires": ["node", "codesign", "plutil"],
  "testedVersion": "1.0.0",
  "lastVerifiedVersion": null,
  "cwd": "harnesses/my-harness",
  "entry": ["bash", "patch.sh"],
  "verify": ["bash", "-n", "patch.sh"],
  "tests": [],
  "restore": null,
  "docs": "harnesses/my-harness/README.md",
  "notes": "هشدار کوتاه فارسی"
}
```

قواعد:

- `slug` با حروف کوچک و خط تیره.
- `cwd` باید داخل `harnesses/<slug>` باشد.
- `entry`/`verify`/`tests`/`restore` آرایهٔ argv هستند؛ shell string ننویسید.
- `entry` پیش‌فرض باید copy mode باشد. اگر in-place است، `inPlace: true` و
  هشدار اجباری.
- `outputBundleId` همان شناسه‌ای است که بعد از build باید در `Info.plist`
  باشد.
- `profile` را بر اساس رفتار واقعی userData انتخاب کنید، نه حدس.
- `testedVersion` را از پروژهٔ منبع بگیرید؛ `lastVerifiedVersion` را فقط بعد
  از build/verify واقعی پر کنید.
- `notes` باید هشدار عملیاتی کوتاه باشد (پروفایل مشترک، درجا، arm64، شبکه).

## README

README فارسی باید این بخش‌ها را داشته باشد:

1. این هارنس چه می‌کند
2. وضعیت نسخه
3. پیش‌نیازها
4. ساخت (دستور دقیق، کپی/درجا، خروجی)
5. تأیید
6. اجرا
7. بازگردانی/حذف
8. بعد از آپدیت upstream
9. هشدارها
10. فایل‌ها
11. مرجع
12. footer توسعه‌دهنده

دستورها را از manifest کپی کنید، نه از حافظه.

## تست

- تست‌های منبع را نگه دارید اگر بدون شبکه/بدون تغییر `/Applications` اجرا
  می‌شوند.
- تست‌های نیازمند jsdom/شبکه را در manifest نگذارید مگر وابستگی‌شان در
  مخزن باشد؛ در README توضیح دهید.
- `verify` باید سبک و قطعی باشد (syntax check یا تست واحد).
- build واقعی را در `docs/verification.md` ثبت کنید.

## حریم خصوصی

قبل از commit:

```bash
node scripts/check-repo.mjs
git add <files>
node scripts/check-repo.mjs --staged
git commit -m "feat: add <slug> harness"
```

اگر اسکنر hit داد، commit نکنید. مسیر شخصی را با `$HOME` یا مسیر نسبی مخزن
عوض کنید. هیچ token/رمز/email شخصی اضافه نکنید.

## چک‌لیست بازبینی

- [ ] slug یکتاست.
- [ ] `cwd` داخل پوشهٔ هارنس است.
- [ ] `entry` copy mode است یا `inPlace` + هشدار دارد.
- [ ] `outputBundleId` درست است.
- [ ] README فارسی و کامل است.
- [ ] footer توسعه‌دهنده دارد.
- [ ] تست سبک پاس می‌شود.
- [ ] `node scripts/check-repo.mjs` پاس می‌شود.
- [ ] فایل build/cache کپی نشده.
- [ ] نام **Mehdi Ravanbakhsh** در اسناد ذکر شده.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

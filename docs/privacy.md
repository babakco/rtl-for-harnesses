# حریم خصوصی و پاکسازی

## سیاست

این مخزن عمومی است. هیچ مقدار واقعی که دسترسی بدهد، کاربر را شناسایی کند یا
مسیر ماشین شخصی را نشان دهد نباید در آن باشد. پاکسازی یک **دروازهٔ سخت**
است، نه یک تلاش بهترین‌کوشش: اگر اسکنر یک مورد پیدا کند، commit متوقف می‌شود.

## چه چیزهایی اسکن می‌شود

- کلیدهای API با پیشوندهای رایج (OpenAI/Anthropic، Google، AWS، GitHub،
  Slack و مشابه).
- Bearer token، OAuth access/refresh token، cookie، session ID، CSRF token،
  webhook secret و MCP token.
- رمز عبور، passphrase، client secret، private key، فایل `.env`،
  `auth.json` و URLهای دیتابیس/Redis/Mongo حاوی اعتبارنامه.
- Sentry DSN، URLهای امضاشده و هر URL دارای token در query string.
- ایمیل شخصی، شماره تلفن، IP خصوصی، نام ماشین، مسیر home مطلق و مسیر
  workspace شخصی.
- فایل‌های ممنوع حتی اگر محتوایشان اسکن نشود: `.env*`، `auth.json`،
  `credentials*`، `*.pem`، `*.p12`، `*.key`، `id_rsa*` و `*.kdbx`.
- فایل‌های بزرگ‌تر از ۵ مگابایت و پوشه‌های build (`node_modules`،
  `.venv`، `build`، `dist`، `target`، `__pycache__`).

## سیاست placeholder

در مثال‌ها فقط یکی از این شکل‌ها مجاز است:

```text
<YOUR_API_KEY>
${ENV_VAR}
YOUR_API_KEY_HERE
```

هیچ پیشوند، طول یا checksum واقعی نباید حفظ شود. خطی که پاک می‌شود نباید
مقدار اصلی را در comment، HTML comment، diff یا فایل backup نگه دارد.

## چه چیزی در این مخزن پاک شد

- مسیرهای مطلق workspace شخصی در ۱۵ نقطه از ۸ سند منبع (MiMo، MiniMax،
  Qoder، Copilot و Claude) به مسیرهای نسبی مخزن یا `$HOME` تبدیل شدند؛ دو
  مسیر مطلق دیگر در `github-copilot/injector/copilot_rtl_inject.m` حذف شد
  (مجموع ۱۷ مورد در ۹ فایل).
- فایل scratch شخصی `Harness-RTL-Project-List.txt` از مخزن خارج شد.
- build cacheها، `.git` پروژه‌های منبع، benchmarkها، inventory مهارت‌ها و
  فایل‌های قیمت مدل کپی نشدند.
- اسکن پیش از طراحی هیچ کلید API، token، رمز، private key، DSN یا URL
  دیتابیس حاوی اعتبارنامه پیدا نکرد. این یک baseline است، نه تضمین.

مقادیر واقعی حذف‌شده هرگز در این سند یا در تاریخ Git نوشته نمی‌شوند.

## اسکنر

```bash
node scripts/check-repo.mjs
node scripts/check-repo.mjs --staged
node scripts/check-repo.mjs --allow-missing-docs   # فقط در مراحل میانی
```

- حالت پیش‌فرض، درخت کاری و مستندات را اسکن می‌کند.
- `--staged` فایل‌های index را می‌خواند؛ قبل از هر commit اجرا شود.
- گزارش فقط دسته، فایل، شماره خط و preview ماسک‌شده را چاپ می‌کند؛ خود
  مقدار هرگز چاپ نمی‌شود.
- خروج با کد `4` یعنی نقض حریم خصوصی یا یکپارچگی.

## قواعد commit

1. قبل از `git add` مطمئن شوید فایل حساسی اضافه نشده.
2. `git add` کنید.
3. `node scripts/check-repo.mjs --staged` را اجرا کنید.
4. فقط با خروجی صفر commit کنید.

```bash
git add <files>
node scripts/check-repo.mjs --staged
git commit -m "<message>"
```

## اگر یک credential واقعی پیدا شد

1. commit نکنید.
2. مقدار را حذف کنید (نه comment).
3. کلید را در سرویس provider باطل/rotate کنید.
4. گزارش masked را خارج از مخزن نگه دارید.
5. اسکن را دوباره اجرا کنید.

## محدودیت‌ها

اسکنر regex-based است و ممکن است false negative داشته باشد. اسکن خودکار
جای بازبینی انسانی را نمی‌گیرد. فایل‌های binary (فونت/ dylib) فقط از نظر
نام و اندازه بررسی می‌شوند؛ محتوای آن‌ها به‌صورت متنی اسکن نمی‌شود. قبل از
انتشار، یک بازبینی چشمی روی diff و `git log -p` انجام دهید.

## نام توسعه‌دهنده

نام **Mehdi Ravanbakhsh** به‌عنوان اعتبار توسعه‌دهنده در همهٔ اسناد مجاز و
الزامی است. این تنها نام شخصی مجاز است. آدرس GitHub noreply نیز در allowlist
اسکنر قرار دارد تا metadata عمومی commit باعث خطای کاذب نشود.

---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../AUTHORS.md)

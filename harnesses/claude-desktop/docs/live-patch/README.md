# Claude Desktop RTL Live Patch — راهنمای استاندارد

> **پچ زندهٔ RTL برای Claude Desktop (macOS)** — اپ اصلی را درجا، با حداقل
> تغییرات، فقط برای فعال‌سازی راست‌چپ (RTL) پچ می‌کند؛ بدون دست‌زدن به پروفایل،
> تنظیمات CC Switch یا تب Claude Code. فونت دلخواه (مثلاً Vazirmatn) **فقط روی
> عناصر متنی** اعمال می‌شود، بنابراین دکمه‌ها و آیکون‌ها ظاهر اصلی خود را حفظ
> می‌کنند.

---

## فهرست

1. [این پچ چیست؟](#۱-این-پچ-چیست)
2. [چرا این روش؟ (پیش‌زمینه)](#۲-چرا-این-روش-پیشزمینه)
3. [پیش‌نیازها](#۳-پیشنیازها)
4. [گردش‌کار پیشنهادی: دو نسخه (اصل + RTL)](#۴-گردشکار-پیشنهادی-دو-نسخه-اصل--rtl)
5. [نصب اولیه](#۵-نصب-اولیه)
6. [اعمال مجدد بعد از هر آپدیت (روش اصلی کار)](#۶-اعمال-مجدد-بعد-از-هر-آپدیت-روش-اصلی-کار)
7. [تأیید صحت](#۷-تأیید-صحت)
8. [بازگردانی (Restore)](#۸-بازگردانی-restore)
9. [رفع اشکال](#۹-رفع-اشکال)
10. [سؤالات متداول (FAQ)](#۱۰-سؤالات-متداول-faq)
11. [جزئیات فنی](#۱۱-جزئیات-فنی)
12. [ساختار پروژه](#۱۲-ساختار-پروژه)

---

## ۱. این پچ چیست؟

`patch-live.sh` اسکریپتی است که **`/Applications/Claude.app`** را **درجا** پچ
می‌کند تا متن فارسی/عربی (و هر متن RTL) در چت و پاسخ‌های Claude به‌درستی
راست‌چین نمایش داده شود، در حالی که بلوک‌های کد و فرمول‌ها چپ‌چین (LTR) می‌مانند.

**تغییراتی که اعمال می‌کند (حداقل و هدفمند):**

| # | تغییر | چرا |
|---|-------|-----|
| 1 | تزریق `rtl-payload.js` (فعال‌سازی RTL) به رندررهای `.vite/build/*.js` | متن فارسی/عربی راست‌چین می‌شود |
| 2 | با `--font NAME` (مثلاً Vazirmatn): جاسازی فونت + اعمال **محدودشده روی عناصر متنی** (`p/li/h1-6/blockquote/td/th/span/div/...`) — دکمه‌ها، آیکون‌ها، اینپوت‌ها و SVG از فونت مستثنا هستند؛ بلوک‌های کد همیشه monospace | فونت متن به Vazirmatn تغییر می‌کند ولی ظاهر دکمه‌ها دست‌نخورده می‌ماند |
| 3 | غیرفعال‌سازی `EnableEmbeddedAsarIntegrityValidation` (fuse) | چون asar تغییر کرده؛ بدون این، اپ کرش می‌کند |
| 4 | امضای ad-hoc با حفظ entitlements | چون امضای Anthropic با تغییر asar باطل می‌شود |

**تغییراتی که اعمال نمی‌کند (مهم):**

- پروفایل کاربری (`~/Library/Application Support/Claude`) — دست نمی‌خورد
- کانفیگ CC Switch (`~/.claude/settings.json`) — دست نمی‌خورد
- تب Claude Code و اتصال به پرووایدرهای شخص ثالث — مثل قبل کار می‌کند
- نام، آیکن و ساختار اپ — دست نمی‌خورد

---

## ۲. چرا این روش؟ (پیش‌زمینه)

### ۲.۱ مشکل صفحهٔ سفید (Blank Window)
وقتی یک کپی از Claude با امضای متفاوت (ad-hoc) از **همان پروفایل** اصلی
استفاده می‌کند، نشست OAuth خراب می‌شود و صفحهٔ سفید می‌آید:

```
oauth authorize rejected with session_stale_relogin;
sessionKey is valid but too old for the requested scope expansion
```

### ۲.۲ مشکل CC Switch و تب Code
پروفایل ایزوله یعنی CC Switch به اپ پچ‌شده نمی‌رسد و نشست `claude_code` همیشه
کهنه می‌ماند → تب Code فعال نمی‌شد.

### ۲.۳ مشکل محو شدن دکمه‌ها با فونت سراسری
نسخهٔ اولیهٔ پچ فونت، فونت را با قانون **سراسری** اعمال می‌کرد:

```css
html, body, body * { font-family: 'Vazirmatn', ... !important; }
```

این قانون روی **همهٔ عناصر** از جمله دکمه‌ها اعمال می‌شد و باعث می‌شد متن و
آیکونِ (SVG) دکمه‌ها در کل اپ — از جمله منوی Settings — **نامرئی** شود (دکمه
هنوز قابل کلیک بود ولی نه نوشته‌اش دیده می‌شد و نه علامتش). این مشکل در نسخهٔ
فعلی با **محدودکردن فونت به عناصر متنی** و **مستثنا کردن دکمه‌ها/آیکون‌ها/اینپوت‌ها/SVG** حل شده است.

### ۲.۴ راه‌حل نهایی: پچ زنده
به‌جای کپی، **همان اپ اصلی** درجا پچ می‌شود (یا یک کپی RTL از آن ساخته می‌شود؛
بند ۴) — پروفایل و نشست همان است → CC Switch و تب Code مثل قبل کار می‌کنند.
خطای `session_stale_relogin` فقط مربوط به **قدمت نشست** است؛ اگر نشست اکانت
تازه باشد، امضای ad-hoc هم صفحهٔ سفید نمی‌آورد.

---

## ۳. پیش‌نیازها

| پیش‌نیاز | توضیح |
|----------|-------|
| macOS | نسخهٔ سازگار با Claude Desktop |
| `/Applications/Claude.app` | نصب و **در مالکیت کاربر** (`ls -ld /Applications/Claude.app` → مالک شما باشد) |
| Node.js ≥ 16 | برای `npx` (`@electron/asar` و `@electron/fuses`) |
| Xcode Command Line Tools | برای `codesign` |

---

## ۴. گردش‌کار پیشنهادی: دو نسخه (اصل + RTL) — روش استاندارد

این روش توصیه‌شده است: **`/Applications/Claude.app` همیشه نسخهٔ اصلی می‌ماند**
(امضای Anthropic؛ آپدیت خودکار مثل قبل کار می‌کند) و یک **کپی RTL جداگانه** می‌سازید
که هر روز با آن کار می‌کنید:

```bash
cd harnesses/claude-desktop
./patch-live.sh --make-rtl --font Vazirmatn
```

### «پچ کن» یعنی همین دستور
وقتی می‌گویید **«پچ کن»**، یعنی `--make-rtl` را اجرا کنید:

1. **کپی از اصل**: نسخهٔ فعلی `/Applications/Claude.app` (که آپدیت شده) به‌جای
   نسخهٔ RTL قبلی (`~/Applications/Claude-RTL.app`) کپی می‌شود (کپی قبلی حذف و
   با نسخهٔ تازه جایگزین می‌شود).
2. **پچ**: کپی تازه پچ می‌شود (RTL + فونت).

چون هر بار از **اصلِ تازه** کپی می‌شود، **نسخهٔ RTL همیشه بروزترین است**.

- **اصل**: `/Applications/Claude.app` — هرگز تغییر نمی‌کند، آپدیت می‌شود.
- **نسخهٔ RTL**: `~/Applications/Claude-RTL.app` — کپی از اصل + پچ.
- **میانبر**: `/Applications/Claude RTL.app` به نسخهٔ RTL اشاره می‌کند (هر دو
  در پوشهٔ Applications دیده می‌شوند).
- مسیر مقصد را می‌توانید تغییر دهید: `RTL_APP_DEST=/path/to/app ./patch-live.sh --make-rtl ...`
- ⚠️ هر دو اپ bundle id مشترک (`com.anthropic.claudefordesktop`) و پروفایل مشترک
  دارند — **همزمان باز نکنید**؛ قبل از باز کردن یکی، دیگری را ببندید.

> اگر فقط یک اپ می‌خواهید (بدون نسخهٔ جدا)، از `--install` استفاده کنید (بند ۵).
> توجه: `--install` روی اصلِ `/Applications/Claude.app` پچ می‌زند و آن را از حالت
> Anthropic-sign خارج می‌کند — در گردش‌کار استاندارد از آن استفاده نمی‌شود.

---

## ۵. نصب اولیه

```bash
cd harnesses/claude-desktop
./patch-live.sh --install --font Vazirmatn
```

> `--font Vazirmatn` اختیاری است (فونت فارسی جاسازی‌شده در `fonts/`). بدون آن
> فقط جهت RTL تغییر می‌کند.

### چه اتفاقی می‌افتد؟
1. **بکاپ خودکار**: `~/Applications/Claude.app.pre-rtl-backup`
   (نسخهٔ Anthropic-sign؛ برای بازگردانی — بند ۸)
2. تزریق RTL + فونت محدودشده به همهٔ رندررها (به‌جز main process)
3. پک مجدد asar و غیرفعال‌سازی fuse
4. امضای ad-hoc با حفظ entitlements

### بعد از نصب
- اگر macOS سؤال Keychain «Claude Safe Storage» پرسید → **تأیید کنید** (سالم است).
- اگر پنجره در اولین اجرا خالی بود → ببندید و دوباره باز کنید (یک‌باره).
- در حالت عادی **نیازی به ورود مجدد نیست** (پروفایل همان است).

---

## ۶. اعمال مجدد بعد از هر آپدیت (روش اصلی کار)

Claude Desktop به‌صورت خودکار آپدیت می‌شود. هر آپدیت روی **اصلِ**
`/Applications/Claude.app` نصب می‌شود (که Anthropic-sign است).

**بعد از هر آپدیت، یک دستور کافی است («پچ کن»):**
```bash
./patch-live.sh --make-rtl --font Vazirmatn
```

این دستور:
1. نسخهٔ RTL قبلی (`~/Applications/Claude-RTL.app`) را حذف می‌کند.
2. نسخهٔ فعلیِ اصلی (`/Applications/Claude.app` — آپدیت‌شده) را به‌جایش کپی می‌کند.
3. کپی را پچ می‌کند (RTL + فونت محدودشده).

→ نتیجه: **نسخهٔ RTL همیشه همان آخرین نسخهٔ اصلی + پچ است.**

**اگر تک‌اپ‌ای کار می‌کنید (نسخهٔ اصلی را پچ می‌کند، نه توصیه‌شده):**
```bash
./patch-live.sh --install --font Vazirmatn
```

> چون نسخهٔ تازه نصب‌شده هیچ مارکری ندارد، تزریق از اول و به‌درستی انجام می‌شود
> (نیازی به `--force` نیست).

### چه زمانی `--force` لازم است؟

فقط وقتی **خودِ اسکریپت/پی‌یلود را تغییر دادید** (مثلاً قوانین فونت را عوض
کردید) ولی اپ هنوز پچِ قبلی را روی خود دارد. در این حالت فایل‌ها «already
patched» هستند و بدون `--force` رد می‌شوند:

```bash
./patch-live.sh --install --font Vazirmatn --force
```

### نکات
- **آپدیت خودکار: دانلود انجام می‌شود ولی نصب نه — این طبیعی است!**
  Squirrel هنگام نصب، هویت امضای اپ را بررسی می‌کند. چون اپ پچ‌شده امضای ad-hoc
  دارد، آپدیت **دانلود** می‌شود ولی نصب/راه‌اندازی مجدد **بی‌صدا رد می‌شود**.
  در گردش‌کار دو نسخه‌ای این فرقی ندارد، چون نسخهٔ اصلی در `/Applications`
  امضای Anthropic دارد و آپدیت روی آن نصب می‌شود؛ فقط `--make-rtl` را اجرا کنید.

  **روش بروزرسانی دستی (دقیق و مطمئن):**
  1. آخرین نسخه را از https://claude.ai/download دانلود کنید.
  2. فایل `.dmg` را باز و اپ را در `/Applications` نصب کنید.
  3. پچ را دوباره اعمال کنید: `./patch-live.sh --make-rtl --font Vazirmatn`
  4. اگر نشست کهنه شده بود: یک‌بار Sign out → Sign in.

- بکاپ قبلی حفظ می‌شود. اگر می‌خواهید بکاپ از **نسخهٔ جدید** بگیرید:
  ```bash
  rm -rf ~/Applications/Claude.app.pre-rtl-backup
  ./patch-live.sh --install --font Vazirmatn
  ```

---

## ۷. تأیید صحت

```bash
cd harnesses/claude-desktop
./patch-live.sh --status
```

خروجی مطلوب:

```
Claude.app: installed (1.26xxx.x)
Backup: exists at ~/Applications/Claude.app.pre-rtl-backup
[+] RTL patch: ACTIVE (fuse disabled)
RTL copy ($HOME/Applications/Claude-RTL.app): version 1.26xxx.x
  [+] patched
```

تست عملی: در چت یک جملهٔ فارسی بنویسید → باید راست‌چین شود. بلوک کد باید
چپ‌چین بماند. **دکمه‌ها (مثل دکمهٔ توقف) باید آیکون و متنِ دیده‌شونده داشته باشند.**
تب Code و پرووایدرهای CC Switch باید مثل قبل کار کنند.

---

## ۸. بازگردانی (Restore)

```bash
cd harnesses/claude-desktop
./patch-live.sh --restore
```

> بکاپ روی نسخهٔ اولین `--install` ثابت می‌ماند؛ پس از آپدیت‌های خودکار، `--restore` ممکن است اپ را downgrade کند—در گردش‌کار دو‌نسخه‌ای ترجیحاً دوباره `--make-rtl` را اجرا کنید، نه `--restore`.

اپ از بکاپ (نسخهٔ Anthropic-sign) برمی‌گردد. بعد از اطمینان:

```bash
rm -rf ~/Applications/Claude.app.pre-rtl-backup
```

---

## ۹. رفع اشکال

| مشکل | علت | راه‌حل |
|------|------|--------|
| **دکمه‌ها خالی‌اند (نه متن نه آیکون)** | فونت با قانون سراسری `body *` از یک پچ قدیمی | پچ را با `--force` دوباره اعمال کنید تا قوانین محدودشده تزریق شود: `./patch-live.sh --install --font Vazirmatn --force` |
| **فقط مدل‌های رسمی / تب Code غیرفعال** | نشست کهنه است | در اپ: Sign out → Sign in. (چت اصلی در هر حالتی از مدل‌های رسمی استفاده می‌کند؛ مدل‌های محلی فقط در تب Code هستند.) |
| **صفحهٔ سفید بعد از پچ** | نشست کهنه یا مشکل یک‌بارهٔ Keychain | اپ را ببندید و باز کنید؛ اگر ماند، یک‌بار ورود مجدد |
| **سؤال Keychain** | امضای جدید | تأیید کنید (یک‌باره) |
| **اپ بعد از آپدیت RTL نیست** | آپدیت پچ را پاک کرده | بند ۶ را اجرا کنید |
| **«Neither asar nor npx found»** | Node نصب نیست | `brew install node` |
| **«Claude.app is not writable»** | مالکیت root | `sudo chown -R $(whoami):staff /Applications/Claude.app` |

---

## ۱۰. سؤالات متداول (FAQ)

**آیا اپ اصلی خراب می‌شود؟**
نه. بکاپ کامل (با امضای Anthropic) ساخته می‌شود و `--restore` آن را برمی‌گرداند.
در گردش‌کار `--make-rtl`، اصل در `/Applications` اصلاً تغییر نمی‌کند.

**آیا آپدیت خودکار Claude ادامه می‌یابد؟**
بله — اصل در `/Applications` امضای Anthropic دارد و آپدیت روی آن نصب می‌شود.
بعد کافی است **«پچ کن»** بگویید: `--make-rtl` نسخهٔ به‌روزشده را به‌جای نسخهٔ
RTL کپی و پچ می‌کند، پس RTL همیشه بروزترین است.

**آیا CC Switch و مدل‌های محلی کار می‌کنند؟**
بله — این دقیقاً هدف طراحی است. پروفایل دست نمی‌خورد، پس همهٔ کانفیگ‌ها سر جایش
هستند.

**چرا چت اصلی مدل محلی را نشان نمی‌دهد؟**
این رفتار عادی Claude Desktop است: چت اصلی همیشه Anthropic است؛ مدل‌های محلی
فقط در تب Code (عامل Claude Code) در دسترس‌اند.

**چرا فونت را روی دکمه‌ها اعمال نمی‌کنید؟**
چون قانون سراسری باعث نامرئی‌شدن متن و آیکون دکمه‌ها می‌شد. فونت فقط روی عناصر
متنی اعمال می‌شود؛ دکمه‌ها فونت اصلی اپ را حفظ می‌کنند.

**گزینهٔ «Chat Font» در تنظیمات چیست و می‌توانم Vazirmatn را به آن اضافه کنم؟**
«Chat Font» متعلق به وباپ claude.ai است (چت از webview رندر می‌شود) و گزینه‌هایش
توسط سرور تعریف می‌شود؛ افزودن گزینهٔ دلخواه به آن به‌سادگی ممکن نیست. این پچ
نیاز به آن را برطرف می‌کند: فونت Vazirmatn را مستقیماً روی متن چت اعمال می‌کند.

**اگر نشست کهنه شد چه کنم؟**
Sign out → Sign in. (خطای `session_stale_relogin` دقیقاً به همین اشاره دارد:
نشست معتبر است ولی برای scope کدنویسی خیلی قدیمی است.)

---

## ۱۱. جزئیات فنی

### فونت محدودشده (با `--font NAME`)
- فونت به‌صورت `@font-face` با base64 data: URI جاسازی می‌شود (CSP اپ فقط
  `data:` را اجازه می‌دهد).
- سپس **فقط روی عناصر متنی** اعمال می‌شود:
  ```css
  :root {
    --font-sans:  '<NAME>', 'Anthropic Sans Variable', 'Anthropic Sans', system-ui, sans-serif;
    --font-voice: '<NAME>', 'Anthropic Sans Variable', 'Anthropic Sans', sans-serif;
  }
  p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, summary, label, legend,
  dt, dd, figcaption, caption, span, div {
    font-family: '<NAME>', 'Anthropic Sans Variable', system-ui, sans-serif;
  }
  /* دکمه‌ها/آیکون‌ها/اینپوت‌ها/SVG فونت اصلی اپ را حفظ می‌کنند */
  button, a, input, textarea, select, svg, code, pre, kbd, samp,
  [role='button'], [class*='icon'], [data-testid*='button'], [data-testid*='icon'] {
    font-family: 'Anthropic Sans Variable', 'Anthropic Sans', system-ui, sans-serif !important;
  }
  pre, code, kbd, samp, [class*='language-'], [class*='token'] {
    font-family: ui-monospace, Menlo, monospace !important;
  }
  ```
- بلوک‌های کد و ترمینال همیشه monospace می‌مانند.

### شاخص‌های سلامت (نشانه‌های نصب موفق)
- `codesign --verify --deep /Applications/Claude.app` → موفق
- `npx --yes @electron/fuses read --app /Applications/Claude.app` →
  `EnableEmbeddedAsarIntegrityValidation ... Disabled`
- `grep -l "CLAUDE RTL PATCH START"` در فایل‌های asar استخراج‌شده → موجود

### لاگ‌ها
- `~/Library/Logs/Claude/main.log` — لاگ اصلی
- `~/Library/Logs/Claude/swift.log` — لاگ سوییفت (فونت‌ها، ...)
- بررسی سریع خطا:
  ```bash
  grep -iE "stale|apiHost|error" ~/Library/Logs/Claude/main.log | tail -20
  ```

### متغیرهای محیطی اسکریپت
| متغیر | پیش‌فرض | توضیح |
|-------|---------|-------|
| `RTL_FONT_FAMILY` | خالی | نام فونت برای متن RTL (معادل `--font`) |
| `RTL_APP_DEST` | `~/Applications/Claude-RTL.app` | مسیر مقصد کپی RTL در `--make-rtl` |

---

## ۱۲. ساختار پروژه

```
claude-desktop-rtl-mac/
├── patch-live.sh          ← ★ پچ زنده (فقط همین اسکریپت استفاده می‌شود)
├── rtl-payload.js         ← کد RTL (تزریق می‌شود)
├── fonts/                 ← فونت‌های جاسازی‌شونده (Vazirmatn و ...)
├── docs/
│   └── live-patch/
│       ├── README.md      ← این راهنما
│       └── QUICK-START.md ← کارت اعمال مجدد سریع (بعد از آپدیت)
└── LICENSE
```

> این پروژه فقط یک هدف دارد: پچ زندهٔ RTL روی `/Applications/Claude.app`.
> هیچ فایل دیگری لازم نیست.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../../AUTHORS.md)

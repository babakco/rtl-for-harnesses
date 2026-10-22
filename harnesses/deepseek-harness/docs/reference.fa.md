# پچ RTL و فونت Vazirmatn برای DeepSeek Harness (macOS)

این پروژه یک نسخه‌ی فارسی‌پسند از اپلیکیشن **DeepSeek Harness** می‌سازد.
اپ اصلی دست‌نخورده باقی می‌ماند و کنارش یک کپی با نام
`DeepSeek Harness-RTL.app` ساخته می‌شود که:

1. **هر جمله یا پاراگرافی که حتی یک حرف فارسی داشته باشد، RTL نمایش داده می‌شود** —
   حتی اگر جمله با کلمه یا حرف انگلیسی یا با علامت و شماره شروع شود.
2. **فونت کل رابط کاربری Vazirmatn** می‌شود (وزن‌های ۱۰۰ تا ۹۰۰، از فایل variable).

هر زمان اپ اصلی را به‌روز کردید، فقط یک دستور را دوباره اجرا کنید (پایین همین صفحه).

---

## ۱. اجرای پچ

```bash
cd ~/Desktop/DSH-GUI
./patch-dsh-rtl.sh
```

خروجی موفق چیزی شبیه این است:

```
==> patching app.asar (RTL engine + Vazirmatn)
==> asar header sha256: 4e08b86c...
==> installing to /Applications/DeepSeek Harness-RTL.app
==> done: /Applications/DeepSeek Harness-RTL.app
```

سپس اجرا کنید:

```bash
open -a "DeepSeek Harness-RTL"
```

### گزینه‌ها

| دستور | کار |
|---|---|
| `./patch-dsh-rtl.sh` | ساخت و نصب نسخه‌ی RTL |
| `./patch-dsh-rtl.sh --no-install` | فقط در `build/stage/` می‌سازد، نصب نمی‌کند |
| `./patch-dsh-rtl.sh --verify` | فقط تست‌های موتور جهت‌دهی را اجرا می‌کند |

اسکریپت **idempotent** است: همیشه از روی نسخه‌ی اصلیِ سالم دوباره می‌سازد،
پس اجرای دوباره‌ی آن هیچ چیز را خراب نمی‌کند. اجرای مجدد حدود ۱۰ ثانیه طول می‌کشد.

---

## ۲. ساختار پروژه

```
DSH-GUI/
├── patch-dsh-rtl.sh          ← نقطه‌ی ورود اصلی
├── package.json              ← فقط برای تست (jsdom)
│
├── payload/                  ← محتوایی که داخل اپ تزریق می‌شود
│   ├── dsh-rtl.css           فونت Vazirmatn + قواعد جهت + استثناهای LTR
│   ├── dsh-rtl.js            موتور تشخیص فارسی و تصمیم‌گیری جهت
│   └── fonts/
│       └── vazirmatn-var.woff2   فونت variable (۱۱۱ کیلوبایت)
│
├── tools/
│   ├── asar-patch.cjs        بازنویسی append-only آرشیو app.asar
│   ├── patch-app.cjs         تعیین اینکه چه چیزی داخل asar نوشته شود
│   ├── make-font.py          تبدیل TTF متغیر Vazirmatn به WOFF2
│   ├── test-rtl-engine.cjs   ۱۹ تست قرارداد جهت‌دهی
│   ├── sync-opencode-free-models.cjs
│   │                         ← روال خودکار همگام‌سازی مدل‌های رایگان
│   │                           opencode با پرووایدر «Free» در DSH
│   └── orchestrator-mode.cjs
│                             ← ساخت و نصب مود Orchestrator در DSH
│                               (نقش‌ها + مدل‌های pin‌شده)
│
├── docs/
│   ├── opencode-free-models.md
│   │                         ← مرجع کامل: endpointها، effortها، دام‌ها
│   └── orchestrator-mode.md  ← نقش‌ها، مدل‌ها، نردبان هزینه، مرز secret
│
└── build/                    ← موقتی؛ در .gitignore
```

---

## ۲.۱ پرووایدر «Free» در DSH — روال خودکار

DSH یک پرووایدر به نام **Free** دارد که مدل‌های رایگان opencode
(OpenCode Go) را سرو می‌کند. این پرووایدر در
`~/.dsh/profiles/desktop/cordis.patch.yml` تعریف شده است.

هر وقت opencode مدل‌های رایگانش را عوض کند، این روال کل چرخه را
خودکار انجام می‌دهد:

```bash
cd ~/OpenCode/DSH-GUI && node tools/sync-opencode-free-models.cjs
```

شش مرحله: **DISCOVER** (لیست زنده + کاتالوگ models.dev) → **PROBE**
(تست زندهٔ هر مدل و کشف effortهای واقعی) → **RENDER** → **APPLY**
(نوشتن در پروفایل، با بکاپ) → **VERIFY** (تست end-to-end داخل DSH) →
**DOCUMENT** (به‌روزرسانی همین سند).

| گزینه | کار |
|---|---|
| *(بدون گزینه)* | چرخهٔ کامل |
| `--dry-run` | بدون نوشتن |
| `--check` | فقط گزارش |
| `--verify` | تست کانفیگ فعلی |

**گاردهای ایمنی:** فقط مدل‌هایی که models.dev قیمتشان را صفر اعلام کرده
وارد پرووایدر می‌شوند (قیمت نامعلوم با «رایگان» فرق دارد)؛ endpointِ
Zen اصلاً استفاده نمی‌شود (به کلاینت شخص ثالث ۴۰۳ می‌دهد)؛ نوشتن
idempotent و atomic است و هر بار بکاپ می‌سازد.

مرجع کامل: `docs/opencode-free-models.md`

زمان‌بندی خودکار روزانه ساعت ۰۶:۰۰ (تهران) از طریق `schedule_create`
در DSH فعال است و skill
`~/.dsh/skills/sync-opencode-free-models/SKILL.md` همین روال را در دسترس
مدل می‌گذارد.

---

## ۲.۲ مود «Orchestrator» در DSH — ساب‌ایجنت با مدل‌های pin‌شده

به‌صورت پیش‌فرض، ابزارهای واگذاری در DSH مدل فرزند را از والد **ارث
می‌برند**؛ پس با مدل اصلی GLM یا Luna، ساب‌ایجنت هم روی همان مدل و همان
هزینه اجرا می‌شود. مود `Orchestrator` این را می‌بندد و هفت نقش با مدل
قفل‌شده می‌سازد:

| نقش | مدل | کاربرد |
|---|---|---|
| `subagent_explore` | free/minimax · max | شناسایی read-only |
| `subagent` | free/minimax · max | کار پیش‌فرض |
| `subagent_fork` | free/minimax · max | پیگیری با تاریخچهٔ ارثی |
| `subagent_work_hard` | Muse · xhigh | استدلال پیچیده |
| `subagent_work_restricted` | DeepSeek · high | تنها مسیر مجاز برای secret |
| `subagent_review` | Muse · xhigh | بازبینی خروجی free |
| `subagent_review_free` | free/minimax · max | بازبینی خروجی Muse/DeepSeek |

مدل **اصلی** آزاد است و مود آن را تعیین نمی‌کند.

نام هر ساب‌ایجنت در فهرست زیرعامل‌ها مدلش را نشان می‌دهد:
`<کار> · <provider>/<model>@<effort>` (مثلاً `backlog inventory · free/minimax-m3.1-flash-free@max`).
جدولِ این پسوندها از همان pinها تولید می‌شود، پس هرگز با مدل واقعی اختلاف پیدا نمی‌کند.

خود orchestrator هم **ساختاراً read-only** است (ابزار `write`/`edit` ندارد): شناسایی
با `subagent_explore`، پیاده‌سازی و ساخت آرتیفکت با `subagent`، و بازبینی مستقل با
`subagent_review` (Muse) — پس کسی که می‌نویسد و کسی که تأیید می‌کند همیشه دو مدل
متفاوت‌اند.

```bash
cd ~/OpenCode/DSH-GUI
node tools/orchestrator-mode.cjs --check    # اعتبارسنجی، بدون نوشتن
node tools/orchestrator-mode.cjs            # نصب/به‌روزرسانی + بکاپ
open -a "DeepSeek Harness-RTL"              # بعد: انتخاب مود از picker
```

اسکریپت idempotent است، همهٔ ردیف‌ها را با schema واقعی پلاگین‌ها
اعتبارسنجی می‌کند، و مسیر هر مدل را با اعلان همان پروفایل تطبیق می‌دهد.

مرجع کامل (چرا این نقش‌ها، چرا این مدل‌ها، چه چیزی ساختاری است و چه چیزی
دستور): `docs/orchestrator-mode.md`

---

## ۳. قرارداد جهت‌دهی (مهم‌ترین بخش)

### خواستهٔ اصلی

> اگر در **هر جای** یک پاراگراف یا جمله **حتی یک** کاراکتر فارسی وجود داشته باشد،
> آن جمله باید RTL نمایش داده شود — حتی اگر ابتدایش انگلیسی یا علامت باشد.

### چرا CSS کافی نیست

این خواسته را CSS به‌تنهایی نمی‌تواند بیان کند:

* `dir="auto"` جهت را از **اولین** کاراکبر قوی تصمیم می‌گیرد
* `unicode-bidi: plaintext` هم همین کار را می‌کند

پس `"API docs این روش کار می‌کند"` با هر دو **LTR** می‌ماند، در حالی که خواستهٔ شما
**RTL** است. به همین دلیل یک موتور JavaScript لازم است.

### روش کار `dsh-rtl.js`

1. یک بار کل درخت DOM را با `TreeWalker` پیمایش می‌کند.
2. هر گرهٔ متنی به **نزدیک‌ترین عنصر بلوکی** خود نگاشت می‌شود
   (`p`, `li`, `td`, `div`, `h1..h6`, `blockquote`, …).
   تگ‌های درون‌خطی مثل `span` و `b` عمداً در این فهرست نیستند، چون متنشان باید
   با پاراگرافِ دورش یکی شود — یعنی دقیقاً همان granularity‌ای که خواسته‌اید.
3. برای هر بلوک بررسی می‌شود که آیا **جایی** در متنش کاراکتار خط عربی/فارسی هست یا نه.
4. اگر بود، روی همان بلوک `dir="rtl"` گذاشته می‌شود.
5. برای موارد استثنا (کد، ترمینال، ریاضی، diff) هیچ دستی زده نمی‌شود؛
   جهت LTR آن‌ها را `!important` در CSS تضمین می‌کند.

### محدودهٔ تشخیص فارسی

```
U+0600–U+06FF   Arabic
U+0750–U+077F   Arabic Supplement
U+08A0–U+08FF   Arabic Extended-A
U+FB50–U+FDFF   Arabic Presentation Forms-A
U+FE70–U+FEFF   Arabic Presentation Forms-B
```

گروه‌های *Presentation Forms* لازم‌اند چون گاهی متن از کپی/پیست یا از تبدیل
PDF/آفیس به‌صورت **پیش‌شکل‌شده** می‌رسد.

### پویایی (streaming)

پاسخ دستیار کلمه‌به‌کلمه جریان دارد. یک `MutationObserver` روی
`document.documentElement` نصب شده و در هر batch (با `requestAnimationFrame`)
فقط زیردرخت‌های تغییرکرده را دوباره بررسی می‌کند. یعنی به‌محض رسیدن اولین
حرف فارسی، همان پاراگراف RTL می‌شود. وقتی فارسی حذف شود دوباره LTR می‌شود.

### احترام به تصمیم خود اپ

اگر خود اپ قبلاً روی عنصری `dir` نوشته باشد، موتور آن را **دست نمی‌زند**؛
فقط مقادیری را مدیریت می‌کند که خودش نوشته (با یک `WeakSet` ردیابی می‌شوند).

---

## ۴. چه چیزی در اپ تغییر کرد

| مورد | وضعیت |
|---|---|
| `Contents/Resources/app.asar` | ۱۲ فایل تزریق/بازنویسی شد (۲۶۲ کیلوبایت اضافه) |
| `Contents/Info.plist` | شناسهٔ باندل، نام، اسکیم URL، هش asar |
| `Contents/Frameworks/*Helper*.app` | ۴ باندل هلپر تغییر نام دادند |
| `Contents/Resources/app-update.yml` | **حذف شد** (آپدیت خودکار خاموش) |
| امضای کد | ad-hoc با همان entitlementهای اصلی |

### چرا bundle id عوض شده؟

```
com.deepseek.dsh  →  com.deepseek.dsh.rtl
```

تا دو اپ بتوانند هم‌زمان نصب باشند، تداخل نداشته باشند، و URL scheme یکی
(`dsh-rtl`) باعث ربودن لینک‌های اپ اصلی نشود.

### چرا هلپرها تغییر نام دادند؟

این تنها گیج‌کننده‌ترین بخش کار بود. Electron هلپرها را با قاعدهٔ
**«نام باندل بیرونی + ` Helper`»** در `Contents/Frameworks` پیدا می‌کند.
اگر فقط نام باندل بیرونی را عوض کنید، اپ با این خطا می‌میرد:

```
FATAL:electron/shell/app/electron_main_delegate_mac.mm:66] Unable to find helper app
```

راه‌حل: هر ۴ هلپر باید همراه با فایل اجرایی و `CFBundleExecutable` خودشان
تغییر نام بدهند:

```
DeepSeek Harness Helper.app          →  DeepSeek Harness-RTL Helper.app
DeepSeek Harness Helper (GPU).app   →  DeepSeek Harness-RTL Helper (GPU).app
DeepSeek Harness Helper (Plugin).app → ... (Plugin)
DeepSeek Harness Helper (Renderer).app → ... (Renderer)
```

### چرا `app-update.yml` حذف شد؟

در `lib/main.js`، آپدیتر فقط وقتی فعال است که این فایل وجود داشته باشد:

```js
enabled: () => app.isPackaged && existsSync(join(process.resourcesPath, "app-update.yml"))
```

پس حذفش، خودکارآپدیت را خاموش می‌کند. این کار **عمدی** است: اگر نسخه‌ی RTL
خودش را آپدیت کند، پچ بی‌سروصدا پاک می‌شود. به‌جایش اپ **اصلی** را آپدیت کنید و
پچ را دوباره اجرا کنید.

همچنین `dshMandatoryUpdatePolicy` از `package.json` داخل asar حذف شد، چون یک
پنجرهٔ «باید آپدیت کنید» می‌سازد که نسخه‌ی RTL (که آپدیتر ندارد) هرگز
نمی‌تواند از آن رد شود و در نتیجه اپ قفل می‌شد.

---

## ۵. دانش فنی که در این مسیر به‌دست آمد

این‌ها نتیجهٔ بررسی باینری و آرشیو واقعی است و در README ثبت شده تا اگر روزی
نسخهٔ جدیدی آمد، بدانید سراغ چه چیزی بروید.

### ۵.۱ قالب `app.asar`

```
[0]      u32  = 4                  اندازهٔ pickle بیرونی
[4]      u32  = 4 + payloadSize    اندازهٔ pickle هدر
[8]      u32  = payloadSize        = 4 + jsonLen + paddingTo4
[12]     u32  = jsonLen            طول JSON هدر
[16]     ...  بایت‌های JSON هدر     سپس صفر تا مرز ۴ بایت
[...]         دادهٔ فایل‌ها          offsetها نسبت به همین نقطه‌اند
```

### ۵.۲ هش Integrity (مهم‌ترین کشف)

در `Info.plist` کلید `ElectronAsarIntegrity` وجود دارد و Electron هنگام بوت
هدر asar را با آن مقایسه می‌کند. الگوریتم دقیقاً این است:

```
hash = sha256( بایت‌های خام JSON هدر )      ← بدون padding
```

یعنی `b.subarray(16, 16 + u32@12)` در فایل asar. این با هش موجود در بستهٔ
DeepSeek تطبیق داده شد و تأیید شد.

**پیامد:** هر بار که چیزی به asar اضافه می‌کنید، باید این هش را در
`Info.plist` دوباره بنویسید، وگرنه اپ اصلاً بالا نمی‌آید.

### ۵.۳ چرا `asar extract` + `asar pack` استفاده نشد

آرشیو ۱۱۷ مگابایت است و **۱۴۹۲ ورودی** با `unpacked: true` دارد
(LibreOfficeKit، `@swc`، `node-pty`، `fontkit`، …). بسته‌بندی دوباره یعنی
بازسازی همهٔ globهای `--unpack` و نوشتن دوبارهٔ کل فایل — کند و مستعد خطا.

به‌جای آن، `tools/asar-patch.cjs` **جراحی‌گونه** عمل می‌کند:

* داده‌های جدید را به **انتهای** بخش داده اضافه می‌کند، پس offset همهٔ فایل‌های
  قبلی بدون تغییر معتبر می‌ماند
* فقط ورودی‌های هدرِ مربوطه را به‌روز می‌کند
* هدر را از نو سر می‌نویسد
* `integrity` هر فایل و هش کل آرشیو را دوباره حساب می‌کند

نتیجه: هر بایت اصلی دست‌نخورده می‌ماند و ۱۱۷ مگابایت بازنویسی نمی‌شود.

### ۵.۴ رندرر از داخل asar سرو می‌شود

اپ فولدر قابل‌نوشتن برای UI ندارد. رندرر از طریق پروتکل اختصاصی
`dsh-app://app/` سرو می‌شود (تابع `serveWebDocument` در `lib/main.js`).
این تابع **فقط** این مسیرها را مجاز می‌داند:

```
/  ·  /index.html  ·  /assets/*  ·  /favicon.svg  ·  /manifest.webmanifest
```

پس هر فایل payload برای پنجرهٔ اصلی **باید** زیر `assets/` باشد. به همین
دلیل مسیر تزریق `assets/rtl/dsh-rtl.css` است، نه ریشهٔ `dist`.

### ۵.۵ نقشهٔ MIME — فقط WOFF2

```js
const MIME = { ".html":…, ".js":…, ".css":…, ".svg":…, ".json":…,
               ".woff2":"font/woff2", ".png":…, ".ico":… };
```

`.ttf` در این فهرست **نیست**، پس فایل TTF با `application/octet-stream` سرو
می‌شود و مرورگر آن را رد می‌کند. به همین دلیل `tools/make-font.py` فونت
را به WOFF2 تبدیل می‌کند (۲۴۱KB → ۱۱۱KB).

### ۵.۶ سیستم فونت اپ

اپ یک متغیر CSS واحد دارد که کل مقیاس تایپوگرافی از آن مشتق می‌شود
(تعریف آن به‌صورت inline داخل JS بستهٔ
`@deepseek-ai/dsh-client-ui-theme` تزریق می‌شود):

```css
:root{ --dsw-font-family: … ;
       --dsw-font-family-brand: … ;
       --ds-font-family-code: "SF Mono", … ; }
```

بنابراین یک override روی `--dsw-font-family` کل رابط را عوض می‌کند.
چون استایل اپ **دیرتر** تزریق می‌شود، override باید `!important` داشته باشد.

> **تغییر از 0.2.1-rc.2:** تم حالا `--dsw-font-family` را مستقیم روی `body`
> هم دوباره تعریف می‌کند (برای ردیف‌های جدید تنظیمات Font، از مسیر
> `--dsh-font-family-text`):
> ```css
> body{ --dsw-font-family:var(--dsh-font-family-text,
>   var(--dsh-font-family-text-default)), var(--dsh-font-family-text-default); … }
> ```
> یک تعریفِ مستقیم روی `body`، مقدارِ به‌ارث‌رسیده از `:root` را سایه می‌کند —
> حتی اگر آن `!important` باشد. به همین دلیل `dsh-rtl.css` از این نسخه به بعد
> هر دو لایه را پین می‌کند: `--dsh-font-family-text(-default)` روی `:root` و
> یک قاعده‌ی `html body` با همان استک Vazirmatn. فیس‌های کد
> (`--ds-font-family-code` و متغیرهای کد مارک‌داون) عمداً دست نخورده‌اند.

تنها جایی که فونت به‌صورت hard-code استفاده شده، وُردمارک صفحهٔ بوت
(`font-family:Montserrat`) است؛ در CSS پچ، خانوادهٔ `Montserrat` دوباره به
Vazirmatn نگاشت می‌شود.

### ۵.۷ امضا و entitlement

Electron بدون این سه entitlement بالا نمی‌آید:

```
com.apple.security.cs.allow-jit
com.apple.security.cs.allow-unsigned-executable-memory
com.apple.security.cs.disable-library-validation
```

اسکریپت آن‌ها را از نسخهٔ اصلی می‌خواند (`codesign -d --entitlements -`)
و با `--options runtime` دوباره امضا می‌کند.

### ۵.۸ داده‌های کاربر

هر دو اپ از `~/.dsh` استفاده می‌کنند (توسط `dsh-home-paths`، با احترام به
متغیر محیطی `DSH_HOME`). یعنی **سشن‌ها، تنظیمات و تاریخچه شما بین هر دو نسخه
مشترک است.** چون هر دو روی یک پوشهٔ داده کار می‌کنند، بهتر است هم‌زمان باز
نباشند.

---

## ۶. تست‌ها

```bash
npm install          # فقط برای تست (jsdom) — خودِ پچ به آن نیاز ندارد
npm test
```

خروجی باید `ALL TESTS PASSED` باشد. ۱۹ تست شامل:

* فارسی خالص → RTL
* **انگلیسی اول، فارسی بعد** → RTL (همان خواستهٔ اصلی شما)
* شروع با علامت و عدد → RTL
* ارقام فارسی (`۱۲۳`) → RTL
* فقط انگلیسی → بدون `dir` (دست‌نخورده)
* دو پاراگراف کنار هم، یکی فارسی یکی انگلیسی → مستقل از هم
* بلوک کد و ترمینال حتی با متن فارسی → هرگز RTL نمی‌شوند
* `dir` نوشته‌شده توسط خود اپ → دست‌نخورده
* `textarea` با مقدار فارسی → RTL
* **streaming**: با رسیدن اولین حرف فارسی بلوک RTL می‌شود و با حذف شدنش
  دوباره LTR می‌شود

اگر بعد از آپدیت اپ رفتار عجیبی دیدید، اول `./patch-dsh-rtl.sh --verify` را
بزنید.

---

## ۷. عیب‌یابی

### اپ باز نمی‌شود / فوراً می‌بندد

```bash
xattr -cr "/Applications/DeepSeek Harness-RTL.app"
codesign --verify --deep --strict "/Applications/DeepSeek Harness-RTL.app"
```

اگر خطای `Unable to find helper app` دیدید، هلپرها درست تغییر نام نداده‌اند —
یک بار دیگر اسکریپت را اجرا کنید.

### بالا می‌آید ولی فارسی RTL نمی‌شود

1. مطمئن شوید نسخهٔ درست را باز کرده‌اید (`open -a "DeepSeek Harness-RTL"`).
2. اگر اپ اصلی هم باز است ببندید؛ هر دو روی `~/.dsh` مشترک‌اند.
3. DevTools را باز کنید (`Cmd+Alt+I`) و در Console بزنید:
   ```js
   window.__DSH_RTL_INSTALLED__   // باید true باشد
   getComputedStyle(document.documentElement)
     .getPropertyValue('--dsw-font-family')   // باید Vazirmatn باشد
   ```
   اگر اولی `undefined` بود، یعنی `dsh-rtl.js` لود نشده — احتمالاً ساختار
   مسیرها در نسخهٔ جدید اپ عوض شده (بخش ۸).

### فونت Vazirmatn اعمال نشد (بعد از آپدیت اپ)

1. بررسی کنید نسخه‌ی RTLِ هم‌نسخه با اپ اصلی ساخته شده باشد (`CFBundleShortVersionString` هر دو باید یکی باشد)؛ اگر نه، `./patch-dsh-rtl.sh` را دوباره اجرا کنید.
2. علت رایج (مشاهده‌شده در 0.2.1-rc.2): تم، متغیر فونت را روی `body` هم بازتعریف کرد و سایه‌ی `:root` شد. از نسخه‌ی فعلی پچ، `dsh-rtl.css` هر دو لایه (`:root` و `html body` + `--dsh-font-family-text`) را پین می‌کند — اگر CSS قدیمی داخل asar مانده، یک بار ریبیلد تمیز کافی است.
3. در DevTools روی `body` بزنید: `getComputedStyle(document.body).getPropertyValue('--dsw-font-family')` باید با `Vazirmatn` شروع شود.

### فونت فارسی عجیب به‌نظر می‌رسد

فونت از روی `~/Library/Fonts/Vazirmatn[wght].ttf` بازسازی می‌شود. اگر فونت
دیگری نصب کرده‌اید، نسخهٔ خودتان را در
`payload/fonts/vazirmatn-var.woff2` بگذارید.

### خاموش کردن موقت موتور (برای عیب‌یابی)

```js
window.__DSH_RTL_DISABLED__ = true;   // در DevTools Console
```

---

## ۸. وقتی اپ اصلی آپدیت شد

اسکریپت خودش تغییرات را **تشخیص نمی‌دهد** — از نو می‌سازد. پس:

```bash
# ۱. اپ اصلی را آپدیت کنید، بعد:
open -a "DeepSeek Harness"

# ۲. نسخهٔ RTL را دوباره بسازید (نسخهٔ قدیمی RTL خودکار جایگزین می‌شود)
cd ~/Desktop/DSH-GUI && ./patch-dsh-rtl.sh
```

### اگر خطا گرفتید: «could not find …/dsh-web-frontend/dist/index.html»

یعنی اپ مسیر رندرر را عوض کرده است. مسیر جدید را پیدا کنید:

```bash
npx --yes @electron/asar list "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" \
  | grep "dist/index.html"
```

و مقدار `DIST` را در `tools/patch-app.cjs` به‌روز کنید.

### اگر خطا گرفتید: فایل‌های `renderer/*.html` پیدا نشدند

اسکریپت این حالت را **نرم** مدیریت می‌کند (رد می‌شود و فقط هشدار می‌دهد)،
چون پنجره‌های خوش‌آمدگویی و آپدیت اختیاری‌اند. اگر می‌خواهید پچ شوند،
لیست `shellDocs` را در `tools/patch-app.cjs` به‌روز کنید.

---

## ۹. محدودیت‌های آگاهانه

1. **کل چیدمان رابط آینه نمی‌شود.** خواستهٔ شما مشخصاً دربارهٔ *جمله و پاراگراف*
   بود، و همین پیاده شده: هر بلوک دارای فارسی RTL می‌شود و بقیهٔ رابط
   چپ‌به‌راست می‌ماند. آینه کردن کل چیدمان (نوار کناری، دکمه‌ها، آیکون‌ها)
   ریسک خراب شدن چیدمان دارد و درخواست نشده بود.
   اگر خواستید، می‌توانید در `dsh-rtl.css` این را امتحان کنید:
   ```css
   html { direction: rtl; }
   ```
   (بگویید تا اضافه‌اش کنم و با هم تستش کنیم.)

2. **متن‌های خودِ رابط انگلیسی‌اند** و LTR می‌مانند — اپ لوکال فارسی ندارد.

3. **دو اپ نباید هم‌زمان باز باشند** چون `~/.dsh` مشترک است.

4. **امضا ad-hoc است**، نه Developer ID. فقط اثر محلی دارد و اپ را مختل
   نمی‌کند، ولی در جای دیگری قابل توزیع نیست.

5. **آپدیت خودکار در نسخهٔ RTL خاموش است** (عمدی). آپ اصلی را آپدیت کنید و
   پچ را دوباره اجرا کنید.

---

## ۱۰. لایسنس و منابع

* Vazirmatn تحت لایسنس **SIL Open Font License 1.1** —
  <https://github.com/rastikerdar/vazirmatn>
* فونت فقط در قالب WOFF2 داخل اپ جاسازی شده و هیچ کدی از اپ DeepSeek
  تغییر منطقی نداده نشده؛ فقط فایل‌های جدید به آرشیو اضافه شده و چند مقدار
  در `Info.plist` عوض شده است.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

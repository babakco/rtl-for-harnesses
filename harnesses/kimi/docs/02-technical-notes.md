# داده‌های فنی و مرجع داخلی

> همهٔ اعداد و ساختارهای این سند از روی **همین نسخهٔ نصب‌شده** و **سورس
> Electron v43.7.3** استخراج شده‌اند (نه حدس). ارجاع‌ها در
> [../research/electron-sources.md](../research/electron-sources.md).

## ۱) مشخصات اپ هدف

| کلید | مقدار |
| --- | --- |
| مسیر | `/Applications/Kimi.app` |
| `CFBundleShortVersionString` | `3.2.14` |
| `CFBundleIdentifier` | `com.moonshot.kimichat` |
| `CFBundleExecutable` | `Kimi` |
| `CFBundleName` | `Kimi` |
| موتور | Electron **43.7.3** (Chrome 150.0.7871.250) |
| `app.asar` | `Contents/Resources/app.asar` — **116,019,062 بایت** (110.6 MiB) |
| package.json (داخل asar) | `name: kimi-desktop` ، `type: module` ، `main: out/main/index.js` |
| پروفایل کاربری | `~/Library/Application Support/kimi-desktop` |

### پنجره‌های مشاهده‌شده در زمان اجرا

| WebContents | نقش |
| --- | --- |
| `app://localhost/kimi-agent.html?…` | پوستهٔ اصلی (Vue، CSP سخت‌گیرانه) |
| `app://localhost/launcher.html?…` | لانچر |
| `app://localhost/volcano-tracker.html?…` | فریم ردیابی/تلمتری |
| `https://www.kimi.ai/` | وب‌اپ چت (در فریم/وب‌ویو) |

### فایل‌های preload خود اپ

`out/preload/`: `preload-capture-pin.mjs`, `preload-claw.mjs`,
`preload-kimi-agent.mjs`, `preload-kimi.mjs`, `preload-launcher.mjs`,
`preload-loading.mjs`, `preload-model-viewer.cjs`, `preload-permission-flow.mjs`,
`preload-scene-editor.cjs`, `preload-zoom-indicator.mjs` → **۱۰ فایل تزریق می‌شود**.

تنظیمات پنجرهٔ اصلی (استخراج‌شده از `out/main/index.js`):

```
webPreferences: {
  preload: <…>/preload-kimi-agent.mjs,
  contextIsolation: true, nodeIntegration: false,
  nodeIntegrationInSubFrames: true, sandbox: false,
  webSecurity: true, webviewTag: true
}
```

`sandbox: false` مهم است: هم preloadهای `.mjs` (ESM) مجاز می‌شوند و هم preload
به `require('electron')` و Node API دسترسی دارد.

---

## ۲) فرمت فایل asar (و بایت‌هایی که Electron هش می‌کند)

```
آفست        نوع      معنا
[0,4)      uint32   payload size پیکل بیرونی (همیشه ۴)
[4,8)      uint32   headerRegionSize = 4 + payloadSize
[8,12)     uint32   payloadSize (شروع پیکل هدر)
[12,16)    uint32   jsonLen  ← طول رشتهٔ JSON هدر
[16, 16+jsonLen)    رشتهٔ JSON هدر (بدون padding)
[16+jsonLen, 8+headerRegionSize)  صفرها = padding تا مضرب ۴
[8+headerRegionSize, …)           ناحیهٔ دادهٔ فایل‌ها
```

- `dataStart = 8 + headerRegionSize`
- `offset` هر فایل در JSON، **نسبت به `dataStart`** است
  (Electron: `info->offset += header_size_`).
- **هش integrity هدر = SHA256 فقط روی بایت‌های رشتهٔ JSON**
  (از آفست ۱۶ به طول `jsonLen`، بدون ۴ بایت طول و بدون padding).

اعداد واقعی این نسخه:

```
jsonLen            = 241401
headerRegionSize   = 241412     ( = 4 + 241401 + padding 3 )
dataStart          = 241420
```

### بایت‌آفست‌های اشتباه (درس‌آموخته)

محاسبهٔ `jsonLen = pickleSize − 8` **غلط** است و باعث این خطای اجرایی می‌شود:

```
FATAL:electron/shell/common/asar/asar_util.cc:187]
Integrity check failed for asar archive entry '<header>' (… vs …, 241984 bytes)
```

مسیر درست:

```js
const jsonLen = buf.readUInt32LE(12);
const jsonStr = buf.subarray(16, 16 + jsonLen).toString("utf8");
```

راستی‌آزمایی قطعی: هش محاسبه‌شده با همین روش روی `Kimi.app` اصلی **دقیقاً**
مقدار `29cdd4bf24c3fa39…` را می‌دهد که در `Info.plist` نسخهٔ اصلی ثبت شده است.

---

## ۳) integrity هر فایل

```json
{ "size": 3916, "offset": "115773726",
  "integrity": { "algorithm": "SHA256",
                 "hash": "ead94bf3…",       // SHA256 کل محتوا
                 "blockSize": 4194304,      // 4 MiB
                 "blocks": ["ead94bf3…"] } } // SHA256 هر چانک ۴MiB
```

- همهٔ **۸۹۵** فایل اصلی این فیلد را دارند (هیچ استثنایی).
- فایل‌های `unpacked` هم این فیلد را دارند (هرچند در خواندن، زودتر return می‌شود).
- پچر برای فایل‌های جدید/بازنویسی‌شده همین ساختار را دقیقاً تولید می‌کند.

۹ فایل unpacked این نسخه:

```
out/native/darwin-arm64/kimi-darwin.node
out/native/darwin-arm64/kimi-file-manager-selection.node
out/native/darwin-arm64/kimi-global-input.node
out/native/darwin-arm64/kimi-keyboard-environment.node
out/native/darwin-arm64/kimi-ocr.node
out/native/darwin-arm64/kimi-screen-capture.node
out/native/darwin-arm64/kimi-scroll-input.node
out/main/chrome-cookie-import-worker.mjs
out/main/workbench-browser-search-worker.mjs
```

---

## ۴) `ElectronAsarIntegrity` در Info.plist

```xml
<key>ElectronAsarIntegrity</key>
<dict>
  <key>Resources/app.asar</key>
  <dict>
    <key>algorithm</key><string>SHA256</string>
    <key>hash</key><string>29cdd4bf24c3fa39fd9349378aec22c34547d61c86522ab464365f118499e25b</string>
  </dict>
</dict>
```

پچر این هش را بعد از بازنویسی asar با مقدار جدید جایگزین می‌کند.
`Info.plist` این اپ **XML** است (نه binary) و با regex ایمن ویرایش می‌شود.

> ⚠️ تجربهٔ گران‌قیمت: استفاده از `PlistBuddy` روی کلیدی که `/` دارد
> (`Resources/app.asar`) کل فایل را خراب کرد. ویرایش رشته‌ای XML روی همان
> ترتیب اصلی، امن است.

---

## ۵) نام‌گذاری helper app (Electron 43، macOS)

از `shell/app/electron_main_delegate_mac.mm`:

```cpp
base::FilePath GetHelperAppPath(frameworks_path, name) {
  helper_name = "Helper" [+ " (Renderer)" | " (GPU)" | " (Plugin)"];
  return frameworks_path / (name + " " + helper_name + ".app")
                        / "Contents/MacOS" / (name + " " + helper_name);
}

OverrideChildProcessPath() {
  helper = GetHelperAppPath(frameworks, ELECTRON_PRODUCT_NAME);   // "Kimi"
  if (!PathExists(helper)) helper = GetHelperAppPath(frameworks, GetApplicationName());
  if (!PathExists(helper)) LOG(FATAL) << "Unable to find helper app";
}
```

نتیجه‌های عملی:

1. `GetApplicationName()` مقدار **`CFBundleName`** است ⇒ اگر `CFBundleName` را
   `Kimi RTL` بگذاریم، helperها باید `Kimi RTL Helper*.app` باشند.
2. چون `PathExists` روی **خود فایل اجرایی** چک می‌شود، فقط تغییر نام پوشه کافی
   نیست؛ فایل داخل `Contents/MacOS/` هم باید همریخت شود (وگرنه خطای
   `FATAL … Unable to find helper app`).
3. `CFBundleName` باید **بدون** پسوند `.app` باشد.

---

## ۶) CSP و راه عبور از آن

`kimi-agent.html` یک CSP متا دارد:

```
style-src 'self' 'unsafe-inline' app: blob:;
font-src  'self' app: blob: data:;
script-src 'self' 'unsafe-inline' 'unsafe-eval' app: blob: https://*.126.net … ;
```

- فونت‌ها data-URI هستند ⇒ با `font-src … data:` سازگارند.
- برای استایل، مسیر اصلی `webFrame.insertCSS(css, { cssOrigin: "user" })` است که
  **از CSP عبور می‌کند** و چون مبدأ آن user است، بر `!important`های نویسندهٔ
  سایت غلبه می‌کند.
- تزریق `<style>` فقط به‌عنوان fallback نگه داشته شده است.
- برای همین، کد جهت‌دهی هم **inline** داخل preload قرار می‌گیرد و از
  `eval`/`new Function` استفاده نمی‌شود.

---

## ۷) خلاصهٔ اثربخشی فونت و جهت

| معیار | ابزار سنجش | نتیجه |
| --- | --- | --- |
| CSS تزریق شده | `getComputedStyle(document.body).fontFamily` | `Vazirmatn, "Vazirmatn FD", …` |
| فونت واقعاً لود شده | `document.fonts.check('14px Vazirmatn')` | `true` |
| قاعدهٔ «فارسی ⇒ RTL» | عنصر آزمایشی `Run 123 test — سلام دنیای فارسی!` | `dir="rtl"` ، `text-align: start` |
| محتوای واقعی | شمارش `.kimi-rtl-auto[dir="rtl"]` در `https://www.kimi.ai/` | ۱۶ عنصر |

## ۸) هزینهٔ حجمی پچ

| مورد | حجم |
| --- | --- |
| `rtl-inline.css` | ۲۸۰.۶ KB |
| `rtl-preload.cjs` | ۲۹۲.۷ KB |
| `rtl-preload.mjs` | ۲۹۲.۰ KB |
| `rtl-autodir.js` | ۸.۷ KB |
| `rtl-main-bootstrap.mjs` | ~۵ KB |
| **اضافه‌شده به asar** | **~۰.۹ MB + ۸.۹ MB** |

افزایش ۸.۹ مگابایتی از این روست که `out/main/index.js` (۸.۹MB) در انتهای ناحیهٔ
داده بازنویسی می‌شود و نسخهٔ قدیمی آن (که بایت‌های دیگر فایل‌ها به آن وابسته‌اند)
سرجایش می‌ماند. `app.asar` از ۱۱۰.۶ MiB به ~۱۲۰ MiB می‌رسد.

---

## ۹) نکات نگه‌داری

- بعد از هر آپدیت Kimi: `./apply-patch.sh` و سپس
  `node patches/scripts/verify-asar.mjs`. اگر Kimi ساختار `out/preload` یا
  `out/main/index.js` را عوض کند، پیام‌های `[patch][warn]` را جدی بگیرید.
- اگر `registerPreloadScript` در نسخه‌های آیندهٔ Electron حذف شد،
  `rtl-main-bootstrap.mjs` به‌صورت خودکار به `setPreloads` برمی‌گردد و در نهایت
  لایهٔ `dom-ready` فعال می‌ماند.
- اگر Kimi فونت/رنگ‌ها را با `!important` سخت‌گیرانه‌تر قفل کند، `insertCSS`
  با `cssOrigin: "user"` کماکان برنده است.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

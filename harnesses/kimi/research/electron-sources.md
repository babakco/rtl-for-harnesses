# شواهد و ارجاع‌های خام

نسخهٔ مرجع: **Electron v43.7.3** (همان نسخهٔ موجود در `Kimi.app`).

## منابع سورس بررسی‌شده

| فایل | چه چیزی از آن استخراج شد |
| --- | --- |
| `shell/common/asar/archive.cc` | ساختار pickle هدر، تعریف `header` به‌عنوان بایت‌های هش‌شده، `header_size_ = 8 + size`، خواندن `offset` نسبت به داده |
| `shell/common/asar/archive.h` | `IntegrityPayload{algorithm, hash, block_size, blocks}` و `HeaderIntegrity()` |
| `shell/common/asar/asar_util.cc` | `ValidateIntegrityOrDie` (پیام خطای `entry '<header>'`)، و اینکه `ReadFileToString` هش کل فایل را چک می‌کند |
| `shell/app/electron_main_delegate_mac.mm` | `GetHelperAppPath` و `OverrideChildProcessPath` (منطق پیدا کردن helper) |
| `shell/common/application_info_mac.mm` | `GetApplicationName()` = مقدار `CFBundleName` |
| `docs/api/session.md` | `registerPreloadScript` / حذف تدریجی `setPreloads` |

## قطعه‌های کلیدی

### ۱) `Archive::Init()` — بایت‌هایی که هش می‌شوند

```cpp
buf.resize(8);
file_.ReadAtCurrentPosAndCheck(buf);                       // [0,8)
uint32_t size;
PickleIterator(Pickle::WithData(buf)).ReadUInt32(&size);   // u32@4
buf.resize(size);
file_.ReadAtCurrentPosAndCheck(buf);                       // [8, 8+size)
std::string header;
PickleIterator(Pickle::WithData(buf)).ReadString(&header); // u32@12 = len ، سپس len بایت

if (fuses::IsEmbeddedAsarIntegrityValidationEnabled() && RelativePath().has_value()) {
  std::optional<IntegrityPayload> integrity = HeaderIntegrity();
  ValidateIntegrityOrDie(base::as_byte_span(header), *integrity, "<header>");
  header_validated_ = true;
}
header_size_ = 8 + size;   // ← شروع ناحیهٔ داده
```

نتیجه: `header` = بایت‌های `[16, 16 + u32@12)` از فایل asar (بدون طول و بدون padding).

### ۲) `FillFileInfoWithNode()` — اجبار integrity برای هر فایل

```cpp
#if BUILDFLAG(IS_MAC) || BUILDFLAG(IS_WIN)
  if (load_integrity && fuses::IsEmbeddedAsarIntegrityValidationEnabled()) {
    if (const base::DictValue* integrity = node->FindDict("integrity")) { … }
    if (!info->integrity.has_value())
      LOG(FATAL) << "Failed to read integrity for file in ASAR archive";
  }
#endif
```

`load_integrity` همان `header_validated_` است؛ پس چون هدر معتبر شده، **همهٔ**
فایل‌های جدید باید `integrity` داشته باشند.

### ۳) `ValidateIntegrityOrDie`

```cpp
const std::string hex_hash = base::ToLowerASCII(base::HexEncode(crypto::hash::Sha256(input)));
if (integrity.hash != hex_hash) {
  LOG(FATAL) << "Integrity check failed for asar archive entry '" << what
             << "' (" << integrity.hash << " vs " << hex_hash << ", " << input.size() << " bytes)";
}
```

### ۴) `OverrideChildProcessPath()`

```cpp
base::FilePath GetHelperAppPath(const base::FilePath& frameworks_path, const std::string& name) {
  … helper_name += " (Renderer)" | " (GPU)" | " (Plugin)" …
  return frameworks_path.Append(name + " " + helper_name + ".app")
                        .Append("Contents").Append("MacOS").Append(name + " " + helper_name);
}

void ElectronMainDelegate::OverrideChildProcessPath() {
  base::FilePath helper_path = GetHelperAppPath(frameworks_path, ELECTRON_PRODUCT_NAME);
  if (!base::PathExists(helper_path))
    helper_path = GetHelperAppPath(frameworks_path, GetApplicationName());
  if (!base::PathExists(helper_path))
    LOG(FATAL) << "Unable to find helper app";
  …
}
```

## شمارش‌های استخراج‌شده از خود `app.asar`

| مورد | مقدار |
| --- | --- |
| حجم فایل | ۱۱۶,۰۱۹,۰۶۲ بایت |
| `u32@0 / @4 / @8 / @12` | `4 / 241412 / 241408 / 241401` |
| شروع ناحیهٔ داده | ۲۴۱۴۲۰ |
| تعداد فایل‌ها | ۸۹۵ (همه دارای بلوک integrity) |
| فایل‌های `unpacked` | ۹ |
| `blockSize` | ۴,۱۹۴,۳۰۴ |
| هش هدر در plist نسخهٔ اصلی | `29cdd4bf24c3fa39fd9349378aec22c34547d61c86522ab464365f118499e25b` |
| هش محاسبه‌شده با روش پچر روی همان فایل | **همان مقدار** (تأیید تجربی) |

## نمونهٔ رکورد فایل در هدر

```json
"out/main/index.js": {
  "size": 8919033,
  "offset": "2819098",
  "integrity": {
    "algorithm": "SHA256",
    "hash": "c59de424b3018fc931b99f2e2edb6e960168b6e03781527a496e43296f3ae726",
    "blockSize": 4194304,
    "blocks": [
      "d20c11d73d67ba4763e01bf09f829880288a9985d2880ddaa3ee64f903404c42",
      "6f2fe06928eac9de70f1d3aceb33df523eea3ccc2e43558ccde309379f197e11",
      "019286a65caf6e66bb6d74ea1fbd7ba49fafa95379e78e8d9786b35aa200d3a9"
    ]
  }
}
```

تأیید شد که `blocks[i] = SHA256(content[i*4MiB : (i+1)*4MiB])` و
`hash = SHA256(content)`.

## CSP وب‌اپ محلی (از `out/renderer/kimi-agent.html`)

```
default-src 'self' app: blob: data:;
script-src  'self' 'unsafe-inline' 'unsafe-eval' app: blob: https://*.126.net https://*.dun.163.com https://*.163yun.com https://*.nstool.netease.com;
style-src   'self' 'unsafe-inline' app: blob:;
font-src    'self' app: blob: data:;
img-src     'self' app: https: http: blob: data: kimi-attach:;
connect-src 'self' app: blob: https: kimi-pdf: kimi-model:;
worker-src  'self' blob:;
frame-src   'self' app: https: http: blob: kimi-preview: kimi-widget:;
media-src   'self' app: https: blob: kimi-media:;
```

## `build-manifest.json` نسخهٔ Kimi (در ریشهٔ همین ریپو)

```json
{ "schemaVersion": 1, "builtAt": "2026-09-24T14:05:19.817Z", "gitHead": "3c0daba0a5",
  "flavor": { "debug": false, "pdfCompatibility": false, "obfuscated": true,
              "allExperiments": false, "appFlavor": "stable", "featureOverrides": "",
              "features": { "rcFiles": true, "versionTrackingAnywhere": true,
                            "versionTrackingHistoryMerge": false } } }
```

## لاگ‌های خطای تاریخی (برای جست‌وجوی آینده)

```
FATAL:electron/shell/app/electron_main_delegate_mac.mm:66] Unable to find helper app
FATAL:electron/shell/common/asar/asar_util.cc:187] Integrity check failed for asar archive entry '<header>' (<plist hash> vs <computed hash>, 241984 bytes)
```

پس از رفع: **هیچ خطای FATAL** در لاگ اجرا مشاهده نشد.
---

توسعه‌دهنده: **Mehdi Ravanbakhsh** — [AUTHORS.md](../../../AUTHORS.md)

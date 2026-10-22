/* ============================================================
 * Kimi RTL Patch — rtl-main-bootstrap.mjs
 *
 * این ماژول به‌عنوان «اولین import» در ابتدای out/main/index.js داخل
 * app.asar تزریق می‌شود؛ بنابراین بدنهٔ آن پیش از هر کد اپ اجرا می‌شود و
 * می‌توانیم شنونده‌های app را زودتر از اپ ثبت کنیم.
 *
 * کارهایی که انجام می‌دهد:
 *   ۱) ثبت rtl-preload.cjs روی همهٔ sessionهای Electron
 *      (registerPreloadScript در Electron ≥35، در غیر این‌صورت setPreloads)
 *   ۲) لایهٔ اطمینان (fallback): اگر preload به هر دلیلی اجرا نشد،
 *      روی رویداد dom-ready هر WebContents، CSS و منطق جهت‌دهی با
 *      insertCSS/executeJavaScript تزریق می‌شود.
 *
 * این فایل هیچ ارتباط شبکه‌ای ندارد و فقط فایل‌های هم‌مسیر خود را می‌خواند.
 *
 * خاموش‌کردن موقت برای عیب‌یابی:  KIMI_RTL_DISABLE=1
 * پروفایل ایزوله اجبارى:           KIMI_RTL_FORCE_ISOLATED=1
 * غیرفعال‌کردن پروفایل ایزوله:      KIMI_RTL_NO_PROFILE_FALLBACK=1
 * بی‌صدا کردن پیام راهنما:          KIMI_RTL_QUIET=1
 * ============================================================ */
import { app, session, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TAG = "[Kimi-RTL]";
const DISABLED = !!process.env.KIMI_RTL_DISABLE;
const DEBUG = !!process.env.KIMI_RTL_DEBUG;

/* در زمان اجرا: <asar>/kimi-rtl/rtl-main-bootstrap.mjs */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.join(HERE, "rtl-preload.cjs");
const AUTODIR = path.join(HERE, "rtl-autodir.js");
const INLINE_CSS = path.join(HERE, "rtl-inline.css");

const registered = new WeakSet();

/* ============================================================
 * ۰) انتخاب پروفایل — رفع «خروج بی‌صدا» در کنار نسخهٔ اصلی
 *
 * Kimi از app.requestSingleInstanceLock() استفاده می‌کند و قفل را در
 * <userData>/SingletonLock به شکل سیم‌لینک «<host>-<pid>» می‌سازد.
 * چون نسخهٔ RTL عیناً همان userData نسخهٔ اصلی را به ارث می‌برد
 * (~/Library/Application Support/kimi-desktop)، اگر Kimi اصلی باز باشد
 * قفل به نسخهٔ دوم داده نمی‌شود و اپ بی‌هیچ پیامی با کد خروج ۰ تمام می‌شود.
 *
 * چاره: ما اولین import فایل اصلی هستیم، پس پیش از آنکه خود اپ قفل
 * بگیرد، اگر پروفایل اشتراکی در اختیار نمونهٔ زندهٔ دیگری باشد
 * پروفایل ایزولهٔ «<userData>-rtl» را انتخاب می‌کنیم؛ نتیجه این‌که هر
 * دو نسخه می‌توانند همزمان اجرا شوند و Kimi RTL هرگز بی‌صدا نمی‌بندد.
 *
 * حالت عادی (نسخهٔ اصلی بسته): همان پروفایل مشترک استفاده می‌شود؛
 * یعنی حساب کاربری، تنظیمات، MCP و مهارت‌ها همه به‌اشتراک باقی می‌مانند.
 * ============================================================ */

const NO_FALLBACK = !!process.env.KIMI_RTL_NO_PROFILE_FALLBACK;
const FORCE_ISOLATED = !!process.env.KIMI_RTL_FORCE_ISOLATED;
const argvHasUserDataDir = process.argv.some((a) => a.startsWith("--user-data-dir"));

/** pid صاحب قفل یک پروفایل (از سیم‌لینک SingletonLock) */
function singletonOwnerPid(dir) {
  try {
    const target = fs.readlinkSync(path.join(dir, "SingletonLock"));
    const m = /-(\d+)$/.exec(target);
    return m ? Number(m[1]) : 0;
  } catch (e) {
    return 0;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return !!(e && e.code === "EPERM");
  }
}

/** pid نمونهٔ زندهٔ دیگری که پروفایل را در اختیار دارد (۰ = آزاد) */
function busyOwnerPid(dir) {
  const pid = singletonOwnerPid(dir);
  if (!pid || pid === process.pid) return 0;
  return pidAlive(pid) ? pid : 0;
}

/** مسیر باندل «.app» خودمان، برای تشخیص این‌که صاحب قفل کیست */
const OWN_BUNDLE = (() => {
  try {
    const m = /^(.*?\.app)\//.exec(process.execPath || "");
    return m ? m[1] : "";
  } catch (e) {
    return "";
  }
})();

/**
 * آیا صاحب قفل، خودِ همین باندل (یعنی «Kimi RTL») است؟
 * اگر بله، باید رفتار طبیعی تک‌نمونه‌ای اپ انجام شود (فقط پنجرهٔ موجود جلو بیاید)
 * و نباید پروفایل ایزوله بسازیم؛ وگرنه با هر کلیک دوباره یک پنجرهٔ تازه باز می‌شد.
 */
function ownerIsSelfBundle(pid) {
  if (!OWN_BUNDLE) return false;
  try {
    const cmd = execFileSync("/bin/ps", ["-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2000
    });
    return cmd.includes(OWN_BUNDLE);
  } catch (e) {
    return false;
  }
}

const sharedUserData = (() => {
  try {
    return app.getPath("userData");
  } catch (e) {
    return "";
  }
})();

let activeUserData = sharedUserData;
let activeProfileNote = "shared";
let isolatedProfileIsNew = false;

(function chooseProfile() {
  if (argvHasUserDataDir) {
    activeProfileNote = "explicit --user-data-dir";
    return;
  }
  if (!sharedUserData || NO_FALLBACK) return;

  let needIsolated = FORCE_ISOLATED;
  if (!needIsolated) {
    try {
      const owner = busyOwnerPid(sharedUserData);
      // قفل آزاد است، یا مال نمونهٔ دیگری از خودِ Kimi RTL است
      // (‌نمونهٔ دیگر RTL ⇒ تک‌نمونه‌ای عادی: پنجرهٔ موجود جلو بیاید)
      needIsolated = owner !== 0 && !ownerIsSelfBundle(owner);
    } catch (e) {
      needIsolated = false;
    }
  }
  if (!needIsolated) return;

  const alt = `${sharedUserData}-rtl`;
  if (busyOwnerPid(alt)) return; // پروفایل ایزوله هم اشغال است → رفتار عادی

  try {
    isolatedProfileIsNew = !fs.existsSync(alt);
    fs.mkdirSync(alt, { recursive: true, mode: 0o700 });
    app.setPath("userData", alt);
    activeUserData = alt;
    activeProfileNote = "isolated (shared profile busy)";
    console.info(`${TAG} shared profile busy → using isolated profile: ${alt}`);
  } catch (e) {
    console.warn(`${TAG} isolated profile failed: ${e && e.message}`);
  }
})();

/** ثبت preload RTL روی یک session (preloadهای خود اپ دست‌نخورده می‌مانند) */
function registerOn(ses, label) {
  if (!ses || registered.has(ses)) return false;
  registered.add(ses);

  if (!fs.existsSync(PRELOAD)) {
    console.warn(`${TAG} preload not found: ${PRELOAD}`);
    return false;
  }

  // Electron ≥ 35
  try {
    if (typeof ses.registerPreloadScript === "function") {
      ses.registerPreloadScript({
        type: "frame",
        id: "kimi-rtl-preload",
        filePath: PRELOAD,
        sandbox: false
      });
      console.info(`${TAG} registerPreloadScript ok (${label})`);
      if (DEBUG) dumpScripts(ses, label);
      return true;
    }
  } catch (e) {
    console.warn(`${TAG} registerPreloadScript failed (${label}): ${e && e.message}`);
  }

  if (DEBUG) {
    try {
      console.info(`${TAG} scripts on session(${label}): ${JSON.stringify(ses.getPreloadScripts ? ses.getPreloadScripts() : "n/a")}`);
    } catch (e) { /* noop */ }
  }

  // Electron < 35 (deprecated but functional)
  try {
    if (typeof ses.setPreloads === "function") {
      const current = typeof ses.getPreloads === "function" ? ses.getPreloads() : [];
      if (!current.includes(PRELOAD)) {
        ses.setPreloads(current.concat([PRELOAD]));
        console.info(`${TAG} setPreloads ok (${label})`);
        return true;
      }
    }
  } catch (e) {
    console.warn(`${TAG} setPreloads failed (${label}): ${e && e.message}`);
  }
  return false;
}

function dumpScripts(ses, label) {
  try {
    const list = typeof ses.getPreloadScripts === "function" ? ses.getPreloadScripts() : null;
    console.info(`${TAG} scripts(${label}): ${JSON.stringify(list)}`);
  } catch (e) { /* noop */ }
}

/* ---------- ۱) ثبت زودهنگام ---------- */

// sessionهای جدید (شامل sessionهای partition شده)
app.on("session-created", (ses) => {
  try { registerOn(ses, "session-created"); } catch (e) { /* noop */ }
});

// session پیش‌فرض — پیش از آنکه اپ پنجره‌ای بسازد
app.on("ready", () => {
  try { registerOn(session.defaultSession, "ready"); } catch (e) { /* noop */ }

  // فقط بار اولی که پروفایل ایزوله ساخته می‌شود، کاربر را توجیه می‌کنیم
  if (isolatedProfileIsNew && !process.env.KIMI_RTL_QUIET) {
    try {
      dialog.showMessageBox({
        type: "info",
        title: "Kimi RTL",
        message: "نسخهٔ اصلی Kimi باز است",
        detail:
          "Kimi RTL برای اینکه بتواند همزمان با نسخهٔ اصلی اجرا شود، با یک پروفایل " +
          "جداگانه باز شد (پوشهٔ kimi-desktop-rtl).\n\n" +
          "در این حالت حساب کاربری، تنظیمات و گفتگوها مستقل است. اگر می‌خواهید " +
          "دقیقاً همان حساب و تنظیمات نسخهٔ اصلی را داشته باشید، Kimi اصلی را ببندید " +
          "و Kimi RTL را یک‌بار دیگر اجرا کنید.",
        buttons: ["باشه"],
        defaultId: 0
      }).catch(() => {});
    } catch (e) { /* noop */ }
  }
});

/* ---------- ۲) لایهٔ اطمینان روی هر WebContents ---------- */
if (!DISABLED) {
  app.on("web-contents-created", (_event, wc) => {
    try {
      wc.on("dom-ready", () => {
        if (DEBUG) console.info(`${TAG} dom-ready: ${wc.getURL()}`);
        // کمی صبر تا preload اصلی فرصت اجرا پیدا کند
        setTimeout(() => {
          let css = "";
          let js = "";
          try {
            css = fs.readFileSync(INLINE_CSS, "utf8");
            js = fs.readFileSync(AUTODIR, "utf8");
          } catch (e) {
            return;
          }
          wc.executeJavaScript(
            "!!document.querySelector('[data-kimi-rtl]')",
            true
          ).then((already) => {
            if (DEBUG) console.info(`${TAG} preload-marker=${already} (${wc.getURL()})`);
            if (already) return; // preload کار خود را کرده است
            console.info(`${TAG} fallback injection → ${wc.getURL()}`);
            wc.insertCSS(css, { cssOrigin: "user" }).catch(() => {});
            wc.executeJavaScript(js, true).catch(() => {});
          }).catch(() => { /* noop */ });
        }, 0);

        if (DEBUG) setTimeout(() => report(wc), 8000);
      });
    } catch (e) { /* noop */ }
  });
}

/** گزارش تشخیصی (فقط با KIMI_RTL_DEBUG=1) */
async function report(wc) {
  try {
    const r = await wc.executeJavaScript(
      `(async () => {
        const probe = document.createElement('div');
        probe.textContent = 'Run 123 test — سلام دنیای فارسی!';
        probe.style.cssText = 'position:absolute;left:-99999px;top:0';
        (document.body || document.documentElement).appendChild(probe);
        await new Promise((res) => setTimeout(res, 400));
        const testDir = probe.getAttribute('dir');
        const testCls = probe.classList.contains('kimi-rtl-auto');
        const testAlign = getComputedStyle(probe).textAlign;
        probe.remove();
        return {
          url: location.href,
          marker: document.documentElement.getAttribute('data-kimi-rtl-src') || 'none',
          auto: document.querySelectorAll('.kimi-rtl-auto').length,
          rtl: document.querySelectorAll('.kimi-rtl-auto[dir="rtl"]').length,
          font: (getComputedStyle(document.body).fontFamily || '').slice(0, 24),
          vazir: !!(document.fonts && document.fonts.check && document.fonts.check('14px Vazirmatn')),
          testDir, testCls, testAlign
        };
      })()`,
      true
    );
    console.info(`${TAG} report ${JSON.stringify(r)}`);
  } catch (e) {
    console.warn(`${TAG} report failed: ${e && e.message}`);
  }
}

console.info(
  `${TAG} bootstrap loaded${DISABLED ? " (disabled)" : ""} | profile=${activeProfileNote} | userData=${activeUserData}`
);

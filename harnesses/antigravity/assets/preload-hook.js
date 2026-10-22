/* ANTIGRAVITY_RTL_HOOK v3 self-contained (sandbox-safe: DOM+console only) */
(function () {
  try {
    /*__AG_RTL_INJECTOR__*/
    function __agRtlBoot() {
      try {
        if (typeof window !== "undefined" && window.__agRtlBooted) return;
        if (typeof window !== "undefined") window.__agRtlBooted = true;
        var n = scanAndFix(document);
        observeRtl();
        try {
          if (typeof console !== "undefined" && console.log) console.log("[rtl] boot ok flipped=" + n);
        } catch (_e) {}
        try {
          if (document && document.documentElement && document.documentElement.setAttribute) document.documentElement.setAttribute("data-ag-rtl", String(n));
        } catch (_e) {}
        try {
          if (document && typeof document.title === "string" && document.title.indexOf("[RTL]") !== 0) document.title = "[RTL] " + document.title;
        } catch (_e) {}
      } catch (e) {
        try {
          if (typeof console !== "undefined" && console.error) console.error("[rtl] boot failed:", e);
        } catch (_e) {}
      }
    }
    try {
      if (typeof document !== "undefined" && document.readyState !== "loading") {
        __agRtlBoot();
      } else if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("DOMContentLoaded", __agRtlBoot);
        window.addEventListener("load", __agRtlBoot);
      }
    } catch (e) {
      try {
        if (typeof console !== "undefined" && console.error) console.error("[rtl] boot failed:", e);
      } catch (_e) {}
    }
  } catch (e) {
    try {
      if (typeof console !== "undefined" && console.error) console.error("[rtl] boot failed:", e);
    } catch (_e) {}
  }
})();

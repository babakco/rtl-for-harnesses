/* Antigravity RTL injector — flips any text block containing Persian to RTL.
 * Loaded via the preload hook (see tools/apply-rtl-patch.sh + assets/preload-hook.js).
 * This module is inert on load: the hook drives boot explicitly
 * (scanAndFix + observeRtl) so failures are observable, never silent.
 * Also importable under Node for tests: pure logic never touches globals
 * except through guarded entry points.
 */
"use strict";

// Verbatim from spec: Arabic + supplements + extended + presentation forms.
const PERSIAN_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const AG_RTL_STYLE_ID = "ag-rtl-style";
// Filled in at patch time with the contents of assets/rtl.css (Task 3).
// eslint-disable-next-line no-unused-vars
const AG_RTL_CSS = "";
const AG_FONT_STACK = '"Vazirmatn","IRANSans",Tahoma,"Segoe UI",sans-serif';

const BLOCK_TAGS = [
  "p", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "div", "blockquote", "td", "th", "label", "pre",
  "section", "article", "main", "aside", "header", "footer", "nav",
  "figcaption", "dt", "dd", "summary", "details",
  "form", "fieldset", "button", "a", "option",
];
const BLOCK_SET = {};
for (let _i = 0; _i < BLOCK_TAGS.length; _i++) BLOCK_SET[BLOCK_TAGS[_i]] = true;
const BLOCK_SELECTOR = BLOCK_TAGS.join(",");
const CODE_TAGS = ["pre", "code", "kbd", "samp"];

function hasPersian(text) {
  return PERSIAN_RE.test(String(text == null ? "" : text));
}

function tagOf(el) {
  return String((el && el.tagName) || "").toLowerCase();
}

function inClosest(el, sel) {
  if (el && typeof el.closest === "function") {
    try {
      return el.closest(sel);
    } catch (_e) {
      return null;
    }
  }
  const tags = sel.split(",").map((s) => s.trim().toLowerCase());
  let n = el ? el.parent : null;
  while (n) {
    if (tags.indexOf(tagOf(n)) !== -1) return n;
    n = n.parent;
  }
  return null;
}

function getDir(el) {
  if (el && typeof el.getAttribute === "function") {
    try {
      return el.getAttribute("dir");
    } catch (_e) {
      return null;
    }
  }
  return null;
}

// False inside pre/code/kbd/samp unless the element itself holds Persian;
// exact semantics are pinned by tests/rtl-inject.test.mjs.
function shouldFlip(el) {
  if (!el) return false;
  if (getDir(el) === "rtl") return false;
  if (!hasPersian(el.textContent || "")) return false;
  const tag = tagOf(el);
  if (CODE_TAGS.indexOf(tag) !== -1) return true;
  if (inClosest(el, CODE_TAGS.join(","))) return false;
  return true;
}

function addRtlClass(el) {
  try {
    if (el.classList && typeof el.classList.add === "function") {
      el.classList.add("ag-rtl");
      return;
    }
    const cur = typeof el.className === "string" ? el.className : "";
    if (/(^|\s)ag-rtl(\s|$)/.test(cur)) return;
    el.className = cur ? cur + " ag-rtl" : "ag-rtl";
  } catch (_e) {
    /* non-fatal: dir attribute alone still flips layout */
  }
}

function ensureStyle(doc) {
  if (!doc || typeof doc.getElementById !== "function") return;
  try {
    if (doc.getElementById(AG_RTL_STYLE_ID)) return;
    const st = doc.createElement("style");
    if (typeof st.setAttribute === "function") {
      st.setAttribute("id", AG_RTL_STYLE_ID);
    } else {
      st.id = AG_RTL_STYLE_ID;
    }
    st.textContent = AG_RTL_CSS;
    const head = doc.head || doc.documentElement || doc;
    if (head && typeof head.appendChild === "function") head.appendChild(st);
  } catch (_e) {
    /* non-fatal */
  }
}

function getParentNode(n) {
  try {
    if (n && n.parentNode) return n.parentNode;
    if (n && n.parentElement) return n.parentElement;
    if (n && n.parent) return n.parent;
  } catch (_e) {}
  return null;
}

function applyFlip(el, counter) {
  try {
    el.setAttribute("dir", "rtl");
  } catch (_e) {
    return false;
  }
  addRtlClass(el);
  try {
    if (el.style && typeof el.style === "object") {
      el.style.fontFamily = AG_FONT_STACK;
    } else {
      try {
        el.style = { fontFamily: AG_FONT_STACK };
      } catch (_e2) {}
    }
  } catch (_e) {}
  try {
    let cur = null;
    try {
      if (typeof getComputedStyle === "function") {
        cur = getComputedStyle(el).textAlign;
      } else if (typeof window !== "undefined" && window && typeof window.getComputedStyle === "function") {
        cur = window.getComputedStyle(el).textAlign;
      } else if (typeof globalThis !== "undefined" && typeof globalThis.getComputedStyle === "function") {
        cur = globalThis.getComputedStyle(el).textAlign;
      }
    } catch (_e2) {
      cur = null;
    }
    if (cur !== "center") {
      try {
        if (el.style && typeof el.style === "object") el.style.textAlign = "right";
      } catch (_e3) {}
    }
  } catch (_e) {}
  return true;
}

function scanAndFix(root) {
  if (!root) return 0;
  if (typeof document !== "undefined") ensureStyle(document);
  const seen = typeof Set !== "undefined" ? new Set() : null;
  const seenList = [];
  function alreadySeen(el) {
    if (seen) return seen.has(el);
    return seenList.indexOf(el) !== -1;
  }
  function markSeen(el) {
    if (seen) seen.add(el);
    else seenList.push(el);
  }
  let n = 0;

  function flipOne(el) {
    if (!el || alreadySeen(el)) return false;
    markSeen(el);
    const t = tagOf(el);
    if (t === "html" || t === "body" || t === "head") return false;
    if (getDir(el) === "rtl") return false;
    if (applyFlip(el)) {
      n++;
      return true;
    }
    return false;
  }

  function nearestBlock(anc) {
    let cur = anc;
    while (cur) {
      const t = tagOf(cur);
      if (!t) {
        cur = getParentNode(cur);
        continue;
      }
      if (t === "script" || t === "style" || t === "noscript") return null;
      if (t === "html" || t === "body" || t === "head") return null;
      if (BLOCK_SET[t]) return cur;
      cur = getParentNode(cur);
    }
    return null;
  }

  function insideCodeish(el) {
    let cur = el;
    // walk parents looking for script/style to skip those subtrees
    while (cur) {
      const t = tagOf(cur);
      if (t === "script" || t === "style" || t === "noscript") return true;
      cur = getParentNode(cur);
    }
    return false;
  }

  function handlePersianText(parent) {
    if (!parent) return;
    const pt = tagOf(parent);
    if (pt === "textarea" || pt === "input") {
      flipOne(parent);
      return;
    }
    if (insideCodeish(parent)) return;
    const blk = nearestBlock(parent);
    if (blk && shouldFlip(blk)) flipOne(blk);
  }

  function walk(node, parent) {
    if (node == null) return;
    if (typeof node === "string") {
      if (hasPersian(node)) handlePersianText(parent);
      return;
    }
    if (node && node.nodeType === 3) {
      let txt = null;
      try {
        txt = node.nodeValue != null ? node.nodeValue : node.textContent;
      } catch (_e) {
        txt = "";
      }
      if (hasPersian(txt)) {
        const par = parent || getParentNode(node);
        handlePersianText(par);
      }
      return;
    }
    const tag = tagOf(node);
    if (tag === "script" || tag === "style" || tag === "noscript") return;
    if (tag === "input" || tag === "textarea") {
      let v = "";
      let tx = "";
      try {
        if (typeof node.value === "string") v = node.value;
        else if (node.value != null) v = String(node.value);
      } catch (_e) {}
      try {
        tx = node.textContent || "";
      } catch (_e) {}
      if (hasPersian(v) || hasPersian(tx)) flipOne(node);
    }
    let kids = null;
    try {
      if (node && node.childNodes && typeof node.childNodes.length === "number") {
        kids = node.childNodes;
      } else if (node && Array.isArray(node.children)) {
        kids = node.children;
      }
    } catch (_e) {
      kids = null;
    }
    if (kids) {
      for (let i = 0; i < kids.length; i++) {
        try {
          walk(kids[i], node);
        } catch (_e) {}
      }
    }
  }

  try {
    walk(root, getParentNode(root));
  } catch (_e) {}
  // Cover inputs reachable via querySelectorAll even if walk missed them.
  try {
    if (root && typeof root.querySelectorAll === "function") {
      const inputs = root.querySelectorAll("input,textarea");
      for (let j = 0; j < inputs.length; j++) {
        const el = inputs[j];
        let vv = "";
        let tt = "";
        try {
          vv = typeof el.value === "string" ? el.value : "";
        } catch (_e) {}
        try {
          tt = el.textContent || "";
        } catch (_e) {}
        if (hasPersian(vv) || hasPersian(tt)) flipOne(el);
      }
    }
  } catch (_e) {}
  return n;
}

function observeRtl() {
  const doc = globalThis.document;
  let scheduled = false;
  const run = () => {
    scheduled = false;
    scanAndFix(doc);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(run);
    } else {
      setTimeout(run, 50);
    }
  };
  const onInput = (e) => {
    try {
      const t = e && e.target;
      if (!t) return;
      const tag = tagOf(t);
      if (tag === "input" || tag === "textarea") {
        let v = "";
        try {
          v = typeof t.value === "string" ? t.value : "";
        } catch (_e) {}
        if (hasPersian(v)) {
          try {
            if (t.getAttribute && t.getAttribute("dir") === "rtl") return;
          } catch (_e) {}
          try {
            if (typeof t.setAttribute === "function") t.setAttribute("dir", "rtl");
          } catch (_e) {}
          addRtlClass(t);
          try {
            if (t.style && typeof t.style === "object") t.style.fontFamily = AG_FONT_STACK;
            else {
              try {
                t.style = { fontFamily: AG_FONT_STACK };
              } catch (_e2) {}
            }
          } catch (_e) {}
        }
        return;
      }
      // Lightweight re-evaluation for other editable targets: scan only the
      // event target subtree instead of the whole document.
      try {
        if (t && (t.nodeType === 1 || t.tagName)) scanAndFix(t);
      } catch (_e) {}
    } catch (_e) {}
  };
  let mo = null;
  try {
    mo = new globalThis.MutationObserver(() => schedule());
    if (doc) mo.observe(doc, { childList: true, subtree: true, characterData: true });
  } catch (_e) {
    mo = null;
  }
  try {
    if (doc && typeof doc.addEventListener === "function") doc.addEventListener("input", onInput, true);
  } catch (_e) {}
  return () => {
    try {
      if (mo) mo.disconnect();
    } catch (_e) {}
    try {
      if (doc && typeof doc.removeEventListener === "function") doc.removeEventListener("input", onInput, true);
    } catch (_e) {}
  };
}

const __agRtl = {
  PERSIAN_RE,
  AG_RTL_STYLE_ID,
  hasPersian,
  shouldFlip,
  scanAndFix,
  observeRtl,
};

if (typeof globalThis !== "undefined") {
  globalThis.__agRtl = __agRtl;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = __agRtl;
}

// NOTE: no auto-boot here by design (review C1). Booting is the preload
// hook's job (assets/preload-hook.js): it calls scanAndFix + observeRtl
// explicitly at the right moment and reports failures instead of
// silently scanning an empty document.

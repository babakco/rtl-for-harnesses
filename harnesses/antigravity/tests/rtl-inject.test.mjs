// tests/rtl-inject.test.mjs — Task 1 (node:test, minimal fake-DOM stub, no deps)
// flip()/burstPasses() are test-local helpers: they build a minimal fake DOM,
// call scanAndFix from assets/rtl-inject.js, and read back dir.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lib = require("../assets/rtl-inject.js");

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toLowerCase();
    this.children = [];
    this.parent = null;
    this.attrs = {};
    this.style = undefined;
    this.value = undefined;
  }
  get textContent() {
    return this.children
      .map((c) => (typeof c === "string" ? c : c.textContent))
      .join("");
  }
  set textContent(v) {
    this.children = [String(v)];
  }
  get className() {
    return this.attrs.class || "";
  }
  set className(v) {
    this.attrs.class = String(v);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  appendChild(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  querySelectorAll(sel) {
    const tags = sel
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const out = [];
    const walk = (node) => {
      for (const c of node.children) {
        if (typeof c === "string") continue;
        if (tags.includes(c.tagName)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  closest(sel) {
    const tags = sel
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    let n = this.parent;
    while (n) {
      if (tags.includes(n.tagName)) return n;
      n = n.parent;
    }
    return null;
  }
}

function parse(html) {
  const root = new FakeEl("root");
  const stack = [root];
  const re = /<\/?([a-zA-Z0-9]+)\s*>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2] !== undefined) {
      stack[stack.length - 1].children.push(m[2]);
    } else if (m[0][1] === "/") {
      if (stack.length > 1) stack.pop();
    } else {
      const el = new FakeEl(m[1]);
      stack[stack.length - 1].appendChild(el);
      stack.push(el);
    }
  }
  return root;
}

function anyRtl(node) {
  for (const c of node.children) {
    if (typeof c === "string") continue;
    if (c.getAttribute("dir") === "rtl") return true;
    if (anyRtl(c)) return true;
  }
  return false;
}

function flip(html) {
  const root = parse(html);
  lib.scanAndFix(root);
  return anyRtl(root) ? "rtl" : "ltr";
}

function burstPasses(n) {
  const rafQ = [];
  let observedCb = null;
  const fakeDoc = {
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
    createElement() {
      const el = new FakeEl("style");
      return el;
    },
    head: new FakeEl("head"),
  };
  globalThis.document = fakeDoc;
  globalThis.MutationObserver = class {
    constructor(cb) {
      observedCb = cb;
    }
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (fn) => {
    rafQ.push(fn);
  };
  try {
    const stop = lib.observeRtl();
    for (let i = 0; i < n; i++) observedCb();
    const passes = rafQ.length;
    stop();
    return passes;
  } finally {
    delete globalThis.document;
    delete globalThis.MutationObserver;
    delete globalThis.requestAnimationFrame;
  }
}

test("flips paragraph starting with English but containing Persian", () => {
  assert.equal(flip("<p>Hello سلام دنیا</p>"), "rtl");
});

test("leaves pure-English paragraph LTR", () => {
  assert.equal(flip("<p>Hello world</p>"), "ltr");
});

test("leaves pure code block LTR", () => {
  assert.equal(flip("<pre><code>const x = 1;</code></pre>"), "ltr");
});

test("flips code block containing Persian", () => {
  assert.equal(flip("<pre><code>// سلام</code></pre>"), "rtl");
});

test("burst mutations schedule a single scan pass", () => {
  assert.equal(burstPasses(50), 1);
});

test("does not over-flip container: only the Persian paragraph flips", () => {
  const root = parse("<div><p>Hello سلام</p><p>English only</p></div>");
  const n = lib.scanAndFix(root);
  assert.equal(n, 1);
  const divs = root.querySelectorAll("div");
  const ps = root.querySelectorAll("p");
  assert.equal(divs.length, 1);
  assert.equal(ps.length, 2);
  assert.equal(divs[0].getAttribute("dir"), null);
  assert.equal(ps[0].getAttribute("dir"), "rtl");
  assert.equal(ps[1].getAttribute("dir"), null);
});

test("flips textarea whose content contains Persian", () => {
  const root = parse("<div><textarea>سلام دنیا</textarea></div>");
  const n = lib.scanAndFix(root);
  assert.equal(n, 1);
  const tas = root.querySelectorAll("textarea");
  assert.equal(tas.length, 1);
  assert.equal(tas[0].getAttribute("dir"), "rtl");
});

test("flipped block gets CSP-immune font fallback via style", () => {
  const root = parse("<p>Hello سلام</p>");
  lib.scanAndFix(root);
  const ps = root.querySelectorAll("p");
  assert.equal(ps[0].getAttribute("dir"), "rtl");
  assert.match(String(ps[0].style && ps[0].style.fontFamily), /Vazirmatn/);
});

test("two-pass scan is idempotent: first returns 1, second returns 0", () => {
  const root = parse("<p>Hello سلام</p>");
  assert.equal(lib.scanAndFix(root), 1);
  assert.equal(lib.scanAndFix(root), 0);
});

test("flips Persian text held in a real DOM text node (nodeType 3 via nodeValue)", () => {
  // Production walk() reads node.nodeValue (fallback: node.textContent) for
  // nodeType===3 children. A real DOM Text carries the same string in
  // nodeValue/data/textContent, so the fake mirrors that; without the
  // nodeType===3 branch the walker would ignore this child and flip nothing.
  const root = new FakeEl("root");
  const p = new FakeEl("p");
  root.appendChild(p);
  const tn = {
    nodeType: 3,
    nodeValue: "Hello سلام",
    data: "Hello سلام",
    textContent: "Hello سلام",
    tagName: "#text",
    children: [],
    parent: null,
    parentNode: null,
  };
  p.appendChild(tn);
  tn.parentNode = p;
  const n = lib.scanAndFix(root);
  assert.equal(n, 1);
  assert.equal(p.getAttribute("dir"), "rtl");
});

// tests/preload-hook.test.mjs — v3 self-contained template (sandbox-safe).
// Substitutes a stub injector for /*__AG_RTL_INJECTOR__*/ and runs the composed
// hook against fake preload globals with NO require/module available.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(root, "assets/preload-hook.js"), "utf8");

const STUB = `
function scanAndFix(doc) { window.__stubCalls.scan++; return 3; }
function observeRtl() { window.__stubCalls.observe++; }
`;

function runHook({ readyState, title = "My App" }) {
  const calls = { scan: 0, observe: 0 };
  const listeners = {};
  const attrs = {};
  const logs = [];
  const errors = [];
  const fakeDocument = {
    readyState,
    title,
    documentElement: {
      setAttribute: (k, v) => {
        attrs[k] = String(v);
      },
    },
  };
  const fakeWindow = {
    __stubCalls: calls,
    addEventListener: (ev, fn) => {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(fn);
    },
  };
  const fakeConsole = {
    log: (...a) => {
      logs.push(a.join(" "));
    },
    error: (...a) => {
      errors.push(a.join(" "));
    },
  };
  const composed = SRC.replace("/*__AG_RTL_INJECTOR__*/", STUB);
  const fn = new Function("document", "window", "console", composed);
  fn(fakeDocument, fakeWindow, fakeConsole);
  return {
    calls,
    listeners,
    errors,
    logs,
    attrs,
    fakeDocument,
    fakeWindow,
    fire(ev) {
      for (const f of listeners[ev] || []) f();
    },
  };
}

test("template is self-contained: marker+placeholder once, no require(", () => {
  assert.equal((SRC.match(/ANTIGRAVITY_RTL_HOOK/g) || []).length, 1);
  assert.equal(SRC.split("/*__AG_RTL_INJECTOR__*/").length - 1, 1);
  assert.ok(!SRC.includes("require("), "template must not contain require(");
});

test("boots immediately when document is past loading", () => {
  const h = runHook({ readyState: "complete" });
  assert.equal(h.calls.scan, 1);
  assert.equal(h.calls.observe, 1);
  assert.ok(h.logs.some((l) => l.includes("[rtl] boot ok flipped=3")));
});

test("title prefix + data-ag-rtl attribute set on success", () => {
  const h = runHook({ readyState: "complete", title: "My App" });
  assert.equal(h.fakeDocument.title, "[RTL] My App");
  assert.equal(h.attrs["data-ag-rtl"], "3");
});

test("does not double-prefix an already-prefixed title", () => {
  const h = runHook({ readyState: "complete", title: "[RTL] My App" });
  assert.equal(h.fakeDocument.title, "[RTL] My App");
});

test("defers boot to DOMContentLoaded while loading", () => {
  const h = runHook({ readyState: "loading" });
  assert.equal(h.calls.scan, 0);
  assert.ok((h.listeners.DOMContentLoaded || []).length >= 1);
  assert.ok((h.listeners.load || []).length >= 1);
  h.fire("DOMContentLoaded");
  assert.equal(h.calls.scan, 1);
  assert.equal(h.calls.observe, 1);
  assert.equal(h.fakeDocument.title, "[RTL] My App");
});

test("never observes twice (boot flag)", () => {
  const h = runHook({ readyState: "complete" });
  h.fire("load");
  assert.equal(h.calls.observe, 1);
  assert.equal(h.calls.scan, 1);
});

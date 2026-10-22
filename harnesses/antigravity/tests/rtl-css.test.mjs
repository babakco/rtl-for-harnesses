// tests/rtl-css.test.mjs — Task 2 (node:test, no deps)
// read() is a test-local helper using node:fs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("font stack starts with Vazirmatn and has Tahoma fallback", () => {
  const css = read("assets/rtl.css");
  assert.match(css, /"Vazirmatn".*Tahoma/s);
});

test("rules target flipped blocks (dir=rtl / .ag-rtl) and add no global body rule", () => {
  const css = read("assets/rtl.css");
  assert.match(css, /\[dir="rtl"\]/);
  assert.doesNotMatch(css, /^body\s*\{/m);
});

test("numbers/code spans inside RTL are isolated", () => {
  assert.match(read("assets/rtl.css"), /unicode-bidi:\s*isolate/);
});

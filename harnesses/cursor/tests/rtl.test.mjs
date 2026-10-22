import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const read = (name) => fs.readFileSync(path.join(harnessDir, name), "utf8");

test("detects Persian letters but not English-only or BOM-only text", () => {
  const rtl = require(path.join(harnessDir, "rtl-fa.js"));

  assert.equal(rtl.hasFA("سلام"), true);
  assert.equal(rtl.hasFA("hello"), false);
  assert.equal(rtl.hasFA("hello دنیا"), true);
  assert.equal(rtl.hasFA("\uFEFFhello"), false);
  assert.equal(rtl.hasFA("12345"), false);
  assert.equal(rtl.hasFA(null), false);
});

test("marks stable input containers instead of ProseMirror paragraphs", () => {
  const js = read("rtl-fa.js");
  const css = read("rtl-fa.css");

  // ProseMirror نودهای پاراگراف را بازسازی می‌کند؛ علامت باید روی کانتینر
  // پایدار بنشیند و CSS جهت را آبشاری اعمال کند.
  assert.match(js, /cursor-rtl-input/);
  assert.match(js, /INPUT_CONTAINER_SEL/);
  assert.match(css, /\.cursor-rtl-input/);
  assert.match(css, /cursor-rtl-input[^{]*p/);
});

test("keeps code, Monaco and terminal selectors out of RTL blocks", () => {
  const js = read("rtl-fa.js");
  const css = read("rtl-fa.css");

  assert.match(js, /markdown-root/);
  assert.match(js, /ProseMirror/);
  assert.match(js, /monaco-editor/);
  assert.match(js, /xterm/);
  assert.match(js, /MutationObserver/);
  assert.match(js, /__cursorRTL/);
  assert.match(css, /@font-face/);
  assert.match(css, /font-family:\s*"Vazirmatn"/);
  assert.match(css, /\.cursor-rtl-fa/);
  assert.match(css, /direction:\s*rtl\s*!important/);
  assert.match(css, /unicode-bidi:\s*embed\s*!important/);
  assert.match(css, /pre/);
  assert.match(css, /code/);
});

test("keeps the original Cursor bundle name for Electron helpers", () => {
  const script = read("patch-cursor-rtl.sh");

  assert.match(script, /\/Applications\/Cursor\.app/);
  assert.match(script, /\/Applications\/Cursor-RTL\.app/);
  assert.match(script, /com\.todesktop\.230313mzl4w4u92\.rtl/);
  assert.match(script, /rtl-fa\.css/);
  assert.match(script, /rtl-fa\.js/);
  assert.match(script, /product\.json/);
  assert.match(script, /workbench\.html/);
  assert.match(script, /--preserve-metadata=entitlements\b/);
  assert.doesNotMatch(script, /flags,runtime/);
  assert.doesNotMatch(script, /plutil\s+-replace\s+CFBundleName/);
});

test("ships the Vazirmatn font files and license", () => {
  for (const name of [
    "vazirmatn-regular.woff2",
    "vazirmatn-medium.woff2",
    "vazirmatn-bold.woff2",
  ]) {
    const file = path.join(harnessDir, name);
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 10000, `${name} is too small`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");
  }
  assert.match(read("OFL.txt"), /SIL OPEN FONT LICENSE/i);
});

test("has a Persian README with build and safety notes", () => {
  const readme = read("README.md");
  assert.match(readme, /Cursor/);
  assert.match(readme, /Cursor-RTL/);
  assert.match(readme, /Vazirmatn/);
  assert.match(readme, /electron-unpacked/);
  assert.match(readme, /Mehdi Ravanbakhsh/);
  assert.match(readme, /هم‌زمان/);
});

test("patch script and browser payload have valid syntax", () => {
  const syntax = spawnSync("bash", ["-n", "patch-cursor-rtl.sh"], {
    cwd: harnessDir,
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);

  const js = spawnSync(process.execPath, ["--check", "rtl-fa.js"], {
    cwd: harnessDir,
    encoding: "utf8",
  });
  assert.equal(js.status, 0, js.stderr);
});

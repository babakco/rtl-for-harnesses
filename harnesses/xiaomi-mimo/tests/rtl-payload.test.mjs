/**
 * Behavioural test for rtl-fa.js (the injected renderer payload).
 *
 * Runs the real payload inside jsdom against DOM shapes that mirror the
 * Xiaomi MiMo AI renderer (textarea.composer-input, markdown blocks, code
 * blocks, list items, plain-text leaf blocks).
 *
 *   npm test
 *
 * No test framework: a tiny assert helper plus a non-zero exit code.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = fs.readFileSync(path.join(here, "..", "rtl-fa.js"), "utf8");

const BLOCK_CLASS = "mimo-rtl-fa";
const INPUT_CLASS = "mimo-rtl-input";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failures.push(`${name}${detail ? ` -> ${detail}` : ""}`);
    console.log(`  \u2717 ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function describe(el) {
  if (!el) return "null";
  const dir = el.getAttribute("dir");
  return `<${el.tagName.toLowerCase()} dir=${dir === null ? "null" : dir} class="${el.className}">`;
}

/** Boots jsdom with the fixture markup and executes the payload. */
async function boot(bodyHtml) {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${bodyHtml}</body></html>`,
    { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" },
  );
  const script = dom.window.document.createElement("script");
  script.textContent = PAYLOAD;
  dom.window.document.head.appendChild(script);
  // let the initial scan + any debounced flush settle (sweep runs at 60ms)
  await new Promise((resolve) => setTimeout(resolve, 150));
  return dom;
}

const isRtl = (el) => el.getAttribute("dir") === "rtl" && el.classList.contains(BLOCK_CLASS);
const untouched = (el) => !el.classList.contains(BLOCK_CLASS) && !el.hasAttribute("dir");

/* ------------------------------------------------------------------ static */
async function testStatic() {
  console.log("\nstatic rendering (model output)");

  const dom = await boot(`
    <div id="transcript">
      <p id="mixed">Hello this is English ولی این جمله فارسی است</p>
      <p id="latin">This paragraph is completely in English.</p>
      <p id="punct">«سلام دنیا» و درود</p>
      <p id="leading-num">2026 — سال جدید مبارک</p>
      <p id="persian-only">این یک پاراگراف کامل فارسی است.</p>
      <p id="emoji">🎉 خوب شد که آمدی</p>
      <pre id="pre"><code id="code">const greeting = "سلام";</code></pre>
      <pre id="shiki-pre" class="shiki"><code id="shiki-code">const y = 1; // فارسی</code></pre>
      <div id="hljs-div" class="hljs"><code id="hljs-code">const w = 9; // فارسی</code></div>
      <span id="katex-span" class="katex">x^2 + سلام</span>
      <div id="bubble" class="whitespace-pre-wrap text-14">پیام کاربر به صورت متن ساده</div>
      <div id="wrapper"><p id="wrapped">فارسی داخل p</p></div>
      <div id="spanonly"><span>فارسی داخل span</span></div>
      <ul id="list"><li id="li1">آیتم اول</li><li id="li2">Second item</li></ul>
      <blockquote id="quote">نقل قول فارسی</blockquote>
      <table><tbody><tr><td id="cell">سلول فارسی</td></tr></tbody></table>
      <div id="toolbar"><button id="persian-btn">ذخیره</button></div>
      <p id="withcode">برای نصب <code>npm install</code> را اجرا کنید</p>
    </div>
  `);
  const d = dom.window.document;

  check("English + Persian paragraph -> RTL", isRtl(d.getElementById("mixed")), describe(d.getElementById("mixed")));
  check("pure English paragraph stays LTR", untouched(d.getElementById("latin")), describe(d.getElementById("latin")));
  check("starts with punctuation, still RTL", isRtl(d.getElementById("punct")), describe(d.getElementById("punct")));
  check("starts with digits/em dash, still RTL", isRtl(d.getElementById("leading-num")), describe(d.getElementById("leading-num")));
  check("pure Persian paragraph -> RTL", isRtl(d.getElementById("persian-only")), describe(d.getElementById("persian-only")));
  check("emoji-prefixed Persian -> RTL", isRtl(d.getElementById("emoji")), describe(d.getElementById("emoji")));
  check("lang attribute set to fa", d.getElementById("mixed").getAttribute("lang") === "fa");
  check("code block untouched", untouched(d.getElementById("code")), describe(d.getElementById("code")));
  check("<pre> untouched", untouched(d.getElementById("pre")), describe(d.getElementById("pre")));
  check("shiki <pre> untouched", untouched(d.getElementById("shiki-pre")), describe(d.getElementById("shiki-pre")));
  check("shiki <code> untouched", untouched(d.getElementById("shiki-code")), describe(d.getElementById("shiki-code")));
  check(".hljs root untouched", untouched(d.getElementById("hljs-div")), describe(d.getElementById("hljs-div")));
  check(".hljs <code> untouched", untouched(d.getElementById("hljs-code")), describe(d.getElementById("hljs-code")));
  check("katex span untouched", untouched(d.getElementById("katex-span")), describe(d.getElementById("katex-span")));
  check("plain-text bubble div -> RTL", isRtl(d.getElementById("bubble")), describe(d.getElementById("bubble")));
  check("block wrapper itself stays LTR", untouched(d.getElementById("wrapper")), describe(d.getElementById("wrapper")));
  check("nested <p> inside wrapper -> RTL", isRtl(d.getElementById("wrapped")), describe(d.getElementById("wrapped")));
  check("span-only container -> RTL", isRtl(d.getElementById("spanonly")), describe(d.getElementById("spanonly")));
  check("Persian <li> -> RTL", isRtl(d.getElementById("li1")), describe(d.getElementById("li1")));
  check("English <li> stays LTR", untouched(d.getElementById("li2")), describe(d.getElementById("li2")));
  check("Persian list -> RTL (markers on the right)", isRtl(d.getElementById("list")), describe(d.getElementById("list")));
  check("blockquote -> RTL", isRtl(d.getElementById("quote")), describe(d.getElementById("quote")));
  check("table cell -> RTL", isRtl(d.getElementById("cell")), describe(d.getElementById("cell")));
  check("toolbar holding buttons is NOT flipped", untouched(d.getElementById("toolbar")), describe(d.getElementById("toolbar")));
  check("paragraph with inline <code> -> RTL", isRtl(d.getElementById("withcode")), describe(d.getElementById("withcode")));

  dom.window.close();
}

/* ----------------------------------------------------------------- dynamic */
async function testDynamic() {
  console.log("\ndynamic behaviour (composer + streaming)");

  const dom = await boot(`
    <div class="composer">
      <textarea id="composer-input" class="composer-input" rows="1"></textarea>
    </div>
    <div id="stream"></div>
  `);
  const w = dom.window;
  const d = w.document;
  const ta = d.getElementById("composer-input");
  const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

  ta.value = "سلام";
  ta.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle();
  check("composer with Persian -> dir=rtl", ta.getAttribute("dir") === "rtl", describe(ta));
  check("composer with Persian -> input class", ta.classList.contains(INPUT_CLASS), describe(ta));

  ta.value = "Hello world, still typing";
  ta.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle();
  check("composer cleared back to LTR", untouched(ta), describe(ta));

  ta.value = "Hello این متن فارسی است";
  ta.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle();
  check("composer starting with Latin but containing Persian -> RTL",
    ta.getAttribute("dir") === "rtl", describe(ta));

  /* streaming: text arrives token by token through characterData mutations */
  const p = d.createElement("p");
  p.textContent = "";
  d.getElementById("stream").appendChild(p);
  await settle();
  check("empty streamed <p> stays LTR", untouched(p), describe(p));

  for (const chunk of ["The answer is", " ", "این", " است"]) {
    p.textContent += chunk;
    await settle();
  }
  check("streamed <p> becomes RTL as soon as Persian arrives", isRtl(p), describe(p));

  /* a block that already carries dir=auto must be restored, not clobbered */
  const q = d.createElement("p");
  q.setAttribute("dir", "auto");
  q.textContent = "متن فارسی";
  d.getElementById("stream").appendChild(q);
  await settle();
  check("existing dir=auto overridden to rtl while Persian", q.getAttribute("dir") === "rtl", describe(q));
  q.textContent = "plain english again";
  await settle();
  check("dir=auto restored when the text becomes English", q.getAttribute("dir") === "auto", describe(q));

  /* MutationObserver path for a freshly appended subtree */
  const holder = d.createElement("div");
  holder.innerHTML = "<div class='msg'><blockquote>پاسخ مدل</blockquote></div>";
  d.getElementById("stream").appendChild(holder);
  await settle();
  const bq = holder.querySelector("blockquote");
  check("newly inserted subtree is processed", isRtl(bq), describe(bq));

  dom.window.close();
}

/* --------------------------------------------------------------------- run */
console.log("mimo-rtl payload tests");
await testStatic();
await testDynamic();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(`  FAILED: ${failure}`);
  process.exit(1);
}

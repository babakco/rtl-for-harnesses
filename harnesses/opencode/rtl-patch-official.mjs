#!/usr/bin/env node

// RTL patcher for OpenCode desktop (v1 single-bundle + v2 code-split).
// v1: patches out/renderer/assets/main-*.js|css in place (8 source files + dock/Pierre passes).
// v2 (2.x): renderer is code-split (1647 JS chunks + main loader). This patcher:
//   - injects a global V2 RTL runtime into main-*.js (MutationObserver-driven,
//     chunk-agnostic so minified Solid internals don't need per-component anchors),
//   - bumps the composer-editor template (13px -> 16px + font-sans + dir=auto) in
//     the composer chunk,
//   - prepends Vazirmatn to the font stack + fixes alignment/plaintext in main CSS,
//   - patches Pierre's diffs font var in the file chunk.
// Markers PROMPT_INPUT_RTL / MARKDOWN_RTL / MESSAGE_RTL / DOCK_TEXT_RTL /
// DOCUMENT_EXTENSIONS / observePierreDocViewers are kept so looksPatched and older
// tooling keep detecting a patched build.
//
// --rtl2 (optional) additionally builds the fully independent "OpenCode-RTL-2"
// variant: own bundle id (ai.opencode.desktop.rtl2 -> own Electron userData,
// stores, single-instance lock, logs), own window/menu name, and the spawned
// background service gets isolated XDG homes under that userData
// (data/config/cache/state). Marker: RTL2_ISOLATION.

import fs from "node:fs"
import path from "node:path"

const unpacked = process.argv[2]
const isRtl2 = process.argv.includes("--rtl2")
if (!unpacked) {
  console.error("Usage: node rtl-patch-official.mjs <unpacked-app-asar> [--rtl2]")
  console.error("For an installed app, use node apply-rtl-patch.mjs instead.")
  process.exit(2)
}

const assets = path.join(unpacked, "out", "renderer", "assets")
const mainJs = findAsset(assets, /^main-.*\.js$/)
const mainCss = findAsset(assets, /^main-.*\.css$/)

let mainJsText = fs.readFileSync(mainJs, "utf8")
const isV2 = mainJsText.includes("__vite__mapDeps") || !mainJsText.includes("function PromptInputV2(props) {")

if (!isV2) {
  patchV1(mainJs, mainCss)
} else {
  patchV2(assets, mainJs, mainCss)
}

// ---------------------------------------------------------------------------
// v1 (single-bundle) path — unchanged behavior.
// ---------------------------------------------------------------------------

function patchV1(mainJsPath, mainCssPath) {
  let js = fs.readFileSync(mainJsPath, "utf8")
  let css = fs.readFileSync(mainCssPath, "utf8")

  const rtlClass = String.raw`[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]`

  // Prompt input direction and size.
  js = replaceOnce(
    js,
    "function PromptInputV2(props) {",
    `const PROMPT_INPUT_RTL = /${rtlClass}/;
const PROMPT_INPUT_LTR = /[A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF]/;
function detectPromptInputV2Direction(text2) {
  if (PROMPT_INPUT_RTL.test(text2)) return "rtl";
  if (PROMPT_INPUT_LTR.test(text2)) return "ltr";
  return null;
}
function applyPromptInputV2Direction(editor) {
  const text2 = (editor.textContent ?? "").replace(/\\u200B/g, "");
  editor.dir = detectPromptInputV2Direction(text2) ?? "auto";
}
function PromptInputV2(props) {`,
    "prompt direction helpers",
  )

  js = patchPromptTemplate(js)
  js = patchTemplateFont(js, "_tmpl$2$L", "prompt placeholder font")
  js = replaceOnce(
    js,
    'props.controller.onInput(prompt.map((part) => part.content).join(""), [...prompt, ...images], cursor2);',
    'props.controller.onInput(prompt.map((part) => part.content).join(""), [...prompt, ...images], cursor2);\n      applyPromptInputV2Direction(event.currentTarget);',
    "prompt input direction",
  )
  js = replaceOnce(
    js,
    "renderPromptInputV2Editor(element2, props.controller.parts());",
    "renderPromptInputV2Editor(element2, props.controller.parts());\n      applyPromptInputV2Direction(element2);",
    "prompt initial direction",
  )

  // Markdown block direction. Code blocks remain LTR through CSS.
  js = replaceOnce(
    js,
    "function Markdown(props) {",
    `const MARKDOWN_RTL = /${rtlClass}/;
const MARKDOWN_DIRECTION_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, td, th, figcaption";
function applyMarkdownDirections(root2) {
  const blocks = root2.querySelectorAll(MARKDOWN_DIRECTION_SELECTOR);
  blocks.forEach((block) => {
    const next2 = MARKDOWN_RTL.test(block.textContent ?? "") ? "rtl" : "ltr";
    if (block.getAttribute("dir") !== next2) block.setAttribute("dir", next2);
  });
}
function Markdown(props) {`,
    "markdown direction helpers",
  )
  js = replaceOnce(
    js,
    "    content.forEach((block, index2) => updateBlock(container, index2, block, labels));",
    "    content.forEach((block, index2) => updateBlock(container, index2, block, labels));\n    applyMarkdownDirections(container);",
    "markdown block direction",
  )

  // Document viewer direction. Diff mode is deliberately left LTR.
  js = replaceOnce(
    js,
    "const VIRTUALIZE_BYTES = 5e5;",
    `const VIRTUALIZE_BYTES = 5e5;
const DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set(["md", "markdown", "mdown", "mkd", "txt", "text", "rst", "adoc", "asciidoc", "textile", "mdy", "mdx"]);
function isDocumentFile(name2) {
  if (!name2) return false;
  const idx = name2.lastIndexOf(".");
  if (idx === -1) return false;
  return DOCUMENT_EXTENSIONS.has(name2.slice(idx + 1).toLowerCase());
}
const RTL_TEXT = /${rtlClass}/;`,
    "document RTL helpers",
  )
  js = replaceOnce(
    js,
    "function ViewerShell(props) {\n  return (() => {",
    "function ViewerShell(props) {\n  const doc2 = props.document === true && props.mode === \"text\";\n  const rtlDoc = doc2 && props.rtlContents === true;\n  return (() => {",
    "document viewer state",
  )
  js = replaceOnce(
    js,
    "    use((el) => props.viewer.wrapper = el, _el$);",
    '    use((el) => props.viewer.wrapper = el, _el$);\n    setAttribute(_el$, "data-document", doc2 ? "true" : void 0);\n    setAttribute(_el$, "data-rtl", rtlDoc ? "true" : void 0);',
    "document viewer attributes",
  )
  js = replaceOnce(
    js,
    "      var _v$ = props.mode, _v$2 = styleVariables, _v$3 = {",
    `      var _v$ = props.mode, _v$2 = {
        ...styleVariables,
        "--opencode-line-dir": rtlDoc ? "rtl" : "ltr",
        "--opencode-line-bidi": "normal",
        "--opencode-line-align": rtlDoc ? "start" : "left"
      }, _v$3 = {`,
    "document viewer line direction",
  )
  js = replaceOnce(
    js,
    'return createComponent(ViewerShell, {\n    mode: "text",\n    viewer,',
    `return createComponent(ViewerShell, {
    mode: "text",
    get document() {
      return isDocumentFile(local.file.name);
    },
    get rtlContents() {
      return RTL_TEXT.test(text2());
    },
    viewer,`,
    "document viewer props",
  )

  // User message direction.
  js = replaceOnce(
    js,
    "function UserMessageDisplay(props) {",
    `const MESSAGE_RTL = /${rtlClass}/;
function UserMessageDisplay(props) {`,
    "user message direction helper",
  )
  js = replaceOnce(
    js,
    "data-slot=user-message-body><div data-slot=user-message-text dir=auto>",
    "data-slot=user-message-body><div data-slot=user-message-text>",
    "user message auto direction",
  )
  js = replaceOnce(
    js,
    '        createRenderEffect(() => setAttribute(_el$38, "data-comments", messageComments().length > 0 ? "true" : void 0));',
    '        createRenderEffect(() => setAttribute(_el$38, "dir", MESSAGE_RTL.test(text2()) ? "rtl" : "ltr"));\n        createRenderEffect(() => setAttribute(_el$38, "data-comments", messageComments().length > 0 ? "true" : void 0));',
    "user message direction",
  )

  // Dock text direction (multi-choice questions asked by the model, and the
  // model-created todo list in the timeline + session todo dock). Container
  // layouts stay LTR; only the question text, option buttons (label +
  // description flip together), the custom-answer textarea, the answered
  // question/answer text, and the todo item text/preview flip to RTL when they
  // contain any RTL char. Solid re-renders these nodes on tab switches, answer
  // updates, and todo changes, so a MutationObserver scoped to the dock/list
  // roots keeps dir attributes correct without touching component logic.
  js = replaceOnce(
    js,
    "const SessionQuestionDock = (props) => {",
    `${dockTextHelpers(rtlClass)}
const SessionQuestionDock = (props) => {`,
    "dock text direction helpers",
  )

  // Pierre document viewer direction (files opened in the sidebar, e.g. .md
  // guides). ViewerShell already flags documentation files with RTL content via
  // data-rtl="true" on the light-DOM host, but the rendered lines live inside
  // the diffs-container shadow root. To stay correct even if the shadow-DOM
  // CSS-variable chain is disturbed (and across Pierre's line re-renders while
  // scrolling), this pass sets dir directly on every [data-line] of RTL-flagged
  // text viewers. Only data-mode="text" viewers flagged data-rtl="true" are
  // touched; diffs and code files stay LTR.
  js = replaceOnce(
    js,
    "const SessionQuestionDock = (props) => {",
    `${pierreHelpers()}
const SessionQuestionDock = (props) => {`,
    "pierre document direction helpers",
  )

  // Pierre's shadow-DOM CSS and font.
  js = replaceOnce(
    js,
    '  "--diffs-font-family": "var(--font-family-mono)",',
    '  "--diffs-font-family": \'"Vazirmatn", var(--font-family-mono)\',',
    "Pierre font",
  )
  js = patchUnsafeCss(js)

  // Global font, markdown alignment, code LTR, and user-message alignment.
  css = replaceOnce(
    css,
    '--font-family-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '--font-family-sans: "Vazirmatn", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    "global Vazirmatn font",
  )
  css = replaceOnce(
    css,
    '--font-family-text: "Inter", sans-serif;',
    '--font-family-text: "Vazirmatn", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    "V2 Vazirmatn font",
  )
  css = replaceOnce(
    css,
    '--v2-font-family-sans: "Inter", sans-serif;',
    '--v2-font-family-sans: "Vazirmatn", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    "V2 sans font",
  )
  css = updateCssBlock(css, '  [data-component="markdown"] {', "markdown root alignment", (block) =>
    addDeclaration(block, "    text-align: start;", "markdown root alignment"),
  )
  for (const selector of [
    '  [data-component="markdown"] h1 {',
    '  [data-component="markdown"] h2 {',
    '  [data-component="markdown"] h3 {',
    '  [data-component="markdown"] h4, [data-component="markdown"] h5, [data-component="markdown"] h6 {',
    '  [data-component="markdown"] p {',
    '  [data-component="markdown"] li {',
    '  [data-component="markdown"] blockquote {',
  ]) {
    css = updateCssBlock(css, selector, `${selector} alignment`, (block) => addDeclaration(block, "    text-align: start;", `${selector} alignment`))
  }
  css = updateCssBlock(css, '  [data-component="markdown"] .shiki {', "markdown Shiki LTR", (block) =>
    addDeclarations(block, ["    direction: ltr;", "    unicode-bidi: normal;", "    text-align: left;"], "markdown Shiki LTR"),
  )
  css = updateCssBlock(css, '  [data-component="markdown"] pre {', "markdown pre LTR", (block) =>
    addDeclarations(block, ["    direction: ltr;", "    unicode-bidi: normal;", "    text-align: left;"], "markdown pre LTR"),
  )
  css = replaceOnce(
    css,
    '  [data-component="markdown"] > * {\n    unicode-bidi: plaintext;\n  }',
    '  [data-component="markdown"] > * {\n    unicode-bidi: normal;\n  }',
    "markdown bidi reset",
  )
  css = updateCssBlock(css, '  [data-component="user-message"] [data-slot="user-message-text"] {', "user message CSS", (block) => {
    const withoutPlaintext = replaceOnce(block, "    unicode-bidi: plaintext;\n", "", "user message plaintext removal")
    return addDeclaration(withoutPlaintext, "    text-align: start;", "user message alignment")
  })

  // Question dock + todo list alignment. Direction itself is set by the JS
  // pass via explicit dir attributes; these rules only make alignment follow
  // that direction. The option button flips text-align left→start so the whole
  // option (checkbox + label + description) mirrors in RTL.
  for (const selector of [
    '  [data-component="dock-prompt"][data-kind="question"] [data-slot="question-text"] {',
    '  [data-component="dock-prompt"][data-kind="question"] [data-slot="option-label"] {',
    '  [data-component="dock-prompt"][data-kind="question"] [data-slot="option-description"] {',
    '  [data-component="question-answers"] [data-slot="question-answer-item"] [data-slot="question-text"] {',
    '  [data-component="question-answers"] [data-slot="question-answer-item"] [data-slot="answer-text"] {',
    '  [data-component="todos"] [data-slot="message-part-todo-content"] {',
  ]) {
    css = updateCssBlock(css, selector, `${selector} alignment`, (block) => addDeclaration(block, "    text-align: start;", `${selector} alignment`))
  }
  css = updateCssBlock(
    css,
    '  [data-component="dock-prompt"][data-kind="question"] [data-slot="question-option"] {',
    "question option alignment",
    (block) => replaceOnce(block, "    text-align: left;", "    text-align: start;", "question option alignment"),
  )

  // Pin the V2 composer size/font outside Tailwind: post-build class swaps cannot
  // generate new utilities (this bundle only ships 11/12/13/15/21px text utilities),
  // so an unlayered rule guarantees 16px + Vazirmatn across restarts. Shell mono
  // keeps working because its font-mono! utility is !important.
  const PROMPT_COMPOSER_PIN =
    'form[data-component="prompt-input-v2"] [data-component="prompt-input"]{font-family:var(--font-sans);font-size:16px}'
  if (css.includes(PROMPT_COMPOSER_PIN)) throw new Error("Already patched prompt composer pin")
  css += `\n${PROMPT_COMPOSER_PIN}\n`

  // Pin the custom-answer textarea + session todo dock alignment outside
  // Tailwind so typed/displayed text follows the JS-set dir attribute (no
  // author rule sets text-align on these nodes).
  const QUESTION_TEXTAREA_PIN = 'textarea[data-slot="question-custom-input"]{text-align:start}'
  if (css.includes(QUESTION_TEXTAREA_PIN)) throw new Error("Already patched question textarea pin")
  css += `\n${QUESTION_TEXTAREA_PIN}\n`
  const TODO_DOCK_PIN =
    '[data-slot="session-todo-preview"],[data-slot="session-todo-list"]{text-align:start}'
  if (css.includes(TODO_DOCK_PIN)) throw new Error("Already patched todo dock pin")
  css += `\n${TODO_DOCK_PIN}\n`

  fs.writeFileSync(mainJsPath, js)
  fs.writeFileSync(mainCssPath, css)
  console.log(`Patched RTL only: ${path.basename(mainJsPath)}, ${path.basename(mainCssPath)}`)
}

// ---------------------------------------------------------------------------
// v2 (code-split) path.
// ---------------------------------------------------------------------------

function patchV2(assetsDir, mainJsPath, mainCssPath) {
  const rtlClass = String.raw`[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]`
  const mainProbe = fs.readFileSync(mainJsPath, "utf8")
  if (mainProbe.includes("V2_RTL_RUNTIME")) throw new Error("Already patched V2 RTL runtime")
  const names = fs.readdirSync(assetsDir).filter((n) => n.endsWith(".js"))

  const composerChunk = findChunkByContent(
    assetsDir,
    names,
    "data-component=composer-editor role=textbox",
    "composer chunk",
  )
  // Route chunk holds the session dock / user message / question templates.
  // It is only used as a presence check: direction is handled by the global
  // runtime so no Solid-internal edit is needed there.
  findChunkByContent(assetsDir, names, "session-question-dock", "route chunk")
  const fileChunk = findChunkByContent(
    assetsDir,
    names,
    '"--diffs-font-family":`var(--font-family-mono)`',
    "file/Pierre chunk",
  )

  // 1. Global RTL runtime into the main loader (runs before lazy chunks).
  let mainJs = mainProbe
  mainJs = replaceOnce(
    mainJs,
    "const __vite__mapDeps=",
    `${v2Runtime(rtlClass)}\nconst __vite__mapDeps=`,
    "V2 RTL runtime",
  )
  if (mainJs.includes('"Vazirmatn", "Inter", ui-sans-serif')) throw new Error("Already patched v2 settings sans fallback")
  mainJs = replaceOnce(
    mainJs,
    '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '"Vazirmatn", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    "v2 settings sans fallback font",
  )
  fs.writeFileSync(mainJsPath, mainJs)

  // 2. Composer template: 13px -> 16px + font-sans + dir=auto.
  // v2 template (minified, no quotes):
  // <div data-component=composer-editor role=textbox aria-multiline=true
  //  autocomplete=off class="... text-[13px] font-[440] ..."style=text-align:start>
  // Placeholder: <div class="pointer-events-none ... text-[13px] font-[440] ..."style=text-align:start>
  let composer = fs.readFileSync(composerChunk, "utf8")
  if (composer.includes("PROMPT_INPUT_RTL")) throw new Error("Already patched v2 composer chunk")
  composer = replaceOnce(
    composer,
    "data-component=composer-editor role=textbox aria-multiline=true autocomplete=off",
    "data-component=composer-editor role=textbox aria-multiline=true autocomplete=off dir=auto",
    "v2 composer direction attribute",
  )
  const composerEditorClass = "text-[13px] font-[440] leading-5 text-v2-text-text-base"
  if (!composer.includes(composerEditorClass)) throw new Error("Missing v2 composer editor size class")
  composer = composer.split(composerEditorClass).join("text-[16px] font-sans font-[440] leading-5 text-v2-text-text-base")
  const composerPlaceholderClass = "text-[13px] font-[440] leading-5 text-v2-text-text-faint"
  if (!composer.includes(composerPlaceholderClass)) throw new Error("Missing v2 composer placeholder size class")
  composer = composer.split(composerPlaceholderClass).join("text-[16px] font-sans font-[440] leading-5 text-v2-text-text-faint")
  composer += `\n/*PROMPT_INPUT_RTL v2 composer template 16px*/\n`
  fs.writeFileSync(composerChunk, composer)

  // 3. Pierre diffs font in the file chunk.
  let fileJs = fs.readFileSync(fileChunk, "utf8")
  fileJs = replaceOnce(
    fileJs,
    '"--diffs-font-family":`var(--font-family-mono)`',
    '"--diffs-font-family":`"Vazirmatn", var(--font-family-mono)`',
    "v2 Pierre font",
  )
  fs.writeFileSync(fileChunk, fileJs)

  // 4. Main CSS (minified, no spaces/quotes around =).
  let css = fs.readFileSync(mainCssPath, "utf8")
  if (css.includes('--font-family-sans:"Vazirmatn"')) throw new Error("Already patched v2 global Vazirmatn font")
  css = replaceOnce(
    css,
    '--font-family-sans:"Inter",',
    '--font-family-sans:"Vazirmatn", "Inter",',
    "v2 global Vazirmatn font",
  )
  if (css.includes('--font-family-text:"Vazirmatn"')) throw new Error("Already patched v2 text Vazirmatn font")
  if (css.includes('--font-family-text:"Inter",')) {
    css = replaceOnce(
      css,
      '--font-family-text:"Inter",',
      '--font-family-text:"Vazirmatn", "Inter",',
      "v2 text Vazirmatn font",
    )
  } else if (!css.includes("--font-family-text:var(--font-family-sans)")) {
    throw new Error("Missing v2 text Vazirmatn font")
  }
  if (css.includes('--v2-font-family-sans:"Vazirmatn"')) throw new Error("Already patched v2 sans Vazirmatn font")
  if (css.includes('--v2-font-family-sans:"Inter",')) {
    css = replaceOnce(
      css,
      '--v2-font-family-sans:"Inter",',
      '--v2-font-family-sans:"Vazirmatn", "Inter",',
      "v2 sans Vazirmatn font",
    )
  } else if (
    !css.includes("--v2-font-family-sans:var(--font-family-sans)") &&
    !css.includes("--v2-font-family-sans:var(--font-family-text)")
  ) {
    throw new Error("Missing v2 sans Vazirmatn font")
  }
  if (css.includes("[data-component=markdown]>*{unicode-bidi:plaintext}")) {
    css = replaceOnce(
      css,
      "[data-component=markdown]>*{unicode-bidi:plaintext}",
      "[data-component=markdown]>*{unicode-bidi:normal}",
      "v2 markdown bidi reset",
    )
  }
  css = replaceOnce(
    css,
    "[data-component=user-message] [data-slot=user-message-text]{white-space:pre-wrap;word-break:break-word;background:var(--v2-background-bg-layer-02);unicode-bidi:plaintext;",
    "[data-component=user-message] [data-slot=user-message-text]{white-space:pre-wrap;word-break:break-word;background:var(--v2-background-bg-layer-02);unicode-bidi:normal;text-align:start;",
    "v2 user message alignment",
  )
  for (const selector of [
    "[data-component=dock-prompt][data-kind=question] [data-slot=question-text]",
    "[data-component=dock-prompt][data-kind=question] [data-slot=option-label]",
    "[data-component=dock-prompt][data-kind=question] [data-slot=option-description]",
    "[data-component=question-answers] [data-slot=question-answer-item] [data-slot=question-text]",
    "[data-component=question-answers] [data-slot=question-answer-item] [data-slot=answer-text]",
    "[data-component=todos] [data-slot=message-part-todo-content]",
  ]) {
    css = updateMinCssBlock(css, selector, `${selector} alignment`, (block) =>
      addMinDeclaration(block, "text-align:start;", `${selector} alignment`),
    )
  }
  const optionSelector = "[data-component=dock-prompt][data-kind=question] [data-slot=question-option]"
  const optionStart = css.indexOf(optionSelector)
  if (optionStart === -1) throw new Error("Missing v2 question option selector")
  const optionOpen = css.indexOf("{", optionStart)
  const optionClose = css.indexOf("}", optionOpen)
  if (optionOpen === -1 || optionClose === -1) throw new Error("Missing v2 question option block")
  const optionBlock = css.slice(optionStart, optionClose)
  if (optionBlock.includes("text-align:left;")) {
    css = updateMinCssBlock(css, optionSelector, "v2 question option alignment", (block) =>
      replaceOnce(block, "text-align:left;", "text-align:start;", "v2 question option alignment"),
    )
  } else if (!optionBlock.includes("text-align:start;")) {
    throw new Error("Missing v2 question option alignment")
  }

  // Unlayered pins (v2 selectors: form[data-component=composer] + composer-editor).
  const V2_COMPOSER_PIN =
    "form[data-component=composer] [data-component=composer-editor]{font-family:var(--font-sans);font-size:16px}"
  if (css.includes(V2_COMPOSER_PIN)) throw new Error("Already patched v2 composer pin")
  css += `\n${V2_COMPOSER_PIN}\n`
  const V2_COMPOSER_BIDI_PIN =
    "[data-component=composer-editor],[data-component=prompt-input]{unicode-bidi:normal!important}"
  if (css.includes(V2_COMPOSER_BIDI_PIN)) throw new Error("Already patched v2 composer bidi pin")
  css += `\n${V2_COMPOSER_BIDI_PIN}\n`
  const QUESTION_TEXTAREA_PIN = 'textarea[data-slot="question-custom-input"]{text-align:start}'
  if (css.includes(QUESTION_TEXTAREA_PIN)) throw new Error("Already patched question textarea pin")
  css += `\n${QUESTION_TEXTAREA_PIN}\n`
  const V2_DOCK_BIDI_PIN = 'textarea[data-slot="question-custom-input"]{unicode-bidi:normal!important}'
  if (css.includes(V2_DOCK_BIDI_PIN)) throw new Error("Already patched v2 dock bidi pin")
  css += `\n${V2_DOCK_BIDI_PIN}\n`

  fs.writeFileSync(mainCssPath, css)
  console.log(
    `Patched RTL v2: ${path.basename(mainJsPath)}, ${path.basename(composerChunk)}, ${path.basename(fileChunk)}, ${path.basename(mainCssPath)}`,
  )
}

function findChunkByContent(assetsDir, names, marker, label) {
  const hits = names
    .filter((n) => !/^main-.*\.js$/.test(n))
    .map((n) => path.join(assetsDir, n))
    .filter((p) => fs.readFileSync(p, "utf8").includes(marker))
  if (hits.length !== 1) throw new Error(`Expected exactly one ${label} containing ${marker}, found ${hits.length}`)
  return hits[0]
}

// Global observer-driven RTL runtime for v2. Works across lazy chunks without
// depending on minified Solid component names. Legacy marker names are kept so
// looksPatched keeps detecting a patched build.
function v2Runtime(rtlClass) {
  return `/*V2_RTL_RUNTIME v6*/
const PROMPT_INPUT_RTL=/${rtlClass}/;
const MARKDOWN_RTL=/${rtlClass}/;
const MESSAGE_RTL=/${rtlClass}/;
const DOCK_TEXT_RTL=/${rtlClass}/;
const DOCUMENT_EXTENSIONS=new Set(["md","markdown","mdown","mkd","txt","text","rst","adoc","asciidoc","textile","mdy","mdx"]);
const V2_RTL_ANY=/${rtlClass}/;
function v2RtlDir(text){return V2_RTL_ANY.test(text??"")?"rtl":"ltr";}
function v2ApplyDir(el,dir){if(el.getAttribute("dir")!==dir)el.setAttribute("dir",dir);if(el.style&&el.style.unicodeBidi==="plaintext")el.style.unicodeBidi="normal";}
const V2_COMPOSER_SELECTOR="[data-component=composer-editor],[data-component=prompt-input][role=textbox]";
function applyComposerDirections(root){
  const scope=root instanceof Element&&root.matches?.(V2_COMPOSER_SELECTOR)?[root]:[...(root.querySelectorAll?.(V2_COMPOSER_SELECTOR)??[])];
  if(root instanceof Element&&root.matches?.(V2_COMPOSER_SELECTOR))scope.push(root);
  const seen=new Set(scope);
  (root.querySelectorAll?.(V2_COMPOSER_SELECTOR)??[]).forEach(e=>seen.add(e));
  seen.forEach(ed=>{const t=(ed.textContent??"").replace(/\\u200B/g,"");v2ApplyDir(ed,v2RtlDir(t));});
}
function applyMarkdownDirections(root){
  const sels="p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,td,th,figcaption,[data-markdown-block]";
  const out=[];
  if(root instanceof Element&&root.matches?.("[data-component=markdown]"))out.push(root);
  root.querySelectorAll?.("[data-component=markdown]").forEach(m=>out.push(m));
  out.forEach(m=>{m.querySelectorAll?.(sels).forEach(b=>v2ApplyDir(b,v2RtlDir(b.textContent)));});
}
function applyMessageDirections(root){
  const els=[];
  if(root instanceof Element&&root.matches?.('[data-slot="user-message-text"]'))els.push(root);
  root.querySelectorAll?.('[data-slot="user-message-text"]').forEach(e=>els.push(e));
  els.forEach(e=>v2ApplyDir(e,v2RtlDir(e.textContent)));
}
const V2_DOCK_TEXT_SELECTOR='[data-slot="question-text"],[data-slot="question-option"],[data-slot="answer-text"],textarea[data-slot="question-custom-input"],[data-slot="message-part-todo-content"]';
const V2_DOCK_SCOPE_SELECTOR='[data-component="session-question-dock"],[data-component="question-answers"],[data-component="todos"],[data-component="session-todo-dock"]';
function dockTextDirectionText(el){
  const t=el instanceof HTMLTextAreaElement?el.value:(el.textContent??"");
  const c=el.querySelector?.('textarea[data-slot="question-custom-input"]');
  if(c instanceof HTMLTextAreaElement&&c.value)return t+"\\n"+c.value;
  return t;
}
function applyDockTextDirections(root){
  const tg=[];
  if(root instanceof Element&&root.matches?.(V2_DOCK_TEXT_SELECTOR))tg.push(root);
  root.querySelectorAll?.(V2_DOCK_TEXT_SELECTOR).forEach(e=>tg.push(e));
  tg.forEach(e=>{const d=v2RtlDir(dockTextDirectionText(e));v2ApplyDir(e,d);if(e.matches?.("[data-slot=question-option]"))e.querySelectorAll?.("[dir=auto]").forEach(x=>v2ApplyDir(x,d));});
}
function dockTextScopeFor(n){if(!(n instanceof HTMLElement))return null;if(n.matches?.(V2_DOCK_SCOPE_SELECTOR))return n;return n.closest?.(V2_DOCK_SCOPE_SELECTOR)??null;}
const pierreDocShadowObservers=new WeakSet();
function pierreDocScopeFor(c){return c.closest?.('[data-component="file"]');}
function applyPierreDocLines(container){
  const root=container.shadowRoot;
  if(!root)return;
  root.querySelectorAll?.("[data-line]").forEach(line=>{
    if(!(line instanceof HTMLElement))return;
    if(line.hasAttribute("data-column-number"))return;
    if(line.closest?.("[data-diff]"))return;
    if(!V2_RTL_ANY.test(line.textContent??""))return;
    if(line.getAttribute("dir")!=="rtl")line.setAttribute("dir","rtl");
    if(line.style.textAlign!=="start")line.style.textAlign="start";
    if(line.style.direction!=="rtl")line.style.direction="rtl";
    if(line.style.unicodeBidi!=="normal")line.style.unicodeBidi="normal";
  });
}
function watchPierreDocContainer(container){
  applyPierreDocLines(container);
  const root=container.shadowRoot;
  if(!root||pierreDocShadowObservers.has(root))return;
  pierreDocShadowObservers.add(root);
  new MutationObserver(ms=>{
    let f=false;
    ms.forEach(m=>m.addedNodes.forEach(n=>{
      if(!(n instanceof HTMLElement))return;
      if(n.matches?.("[data-line]")||n.querySelector?.("[data-line]"))f=true;
    }));
    if(f)applyPierreDocLines(container);
  }).observe(root,{childList:true,subtree:true,characterData:true});
}
function observePierreDocViewers(mutations){
  const cs=new Set();
  const col=n=>{
    if(!(n instanceof HTMLElement))return;
    if(n.tagName.toLowerCase()==="diffs-container")cs.add(n);
    n.querySelectorAll?.("diffs-container").forEach(x=>cs.add(x));
  };
  if(!mutations)document.querySelectorAll?.("diffs-container").forEach(n=>cs.add(n));
  else mutations.forEach(m=>m.addedNodes.forEach(col));
  cs.forEach(watchPierreDocContainer);
}
function applyV2Rtl(root){
  try{applyComposerDirections(root);}catch{}
  try{applyMarkdownDirections(root);}catch{}
  try{applyMessageDirections(root);}catch{}
  try{applyDockTextDirections(root);}catch{}
}
const dockTextDirectionObserver=new MutationObserver(mutations=>{
  const scopes=new Set();
  mutations.forEach(mu=>{
    const s=dockTextScopeFor(mu.target);
    if(s)scopes.add(s);
    mu.addedNodes.forEach(n=>{
      const a=dockTextScopeFor(n);
      if(a)scopes.add(a);
      if(n instanceof HTMLElement)n.querySelectorAll?.(V2_DOCK_SCOPE_SELECTOR).forEach(x=>scopes.add(x));
    });
  });
  scopes.forEach(applyDockTextDirections);
  try{applyV2Rtl(document);}catch{}
  observePierreDocViewers(mutations);
});
function bootstrapV2Rtl(){
  try{
    dockTextDirectionObserver.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["dir"]});
    document.addEventListener("input",e=>{
      const t=e.target;
      const host=t instanceof HTMLElement?(t.closest?.("[data-component=composer-editor]")||t.closest?.("[data-component=prompt-input][role=textbox]")):null;
      if(host)applyComposerDirections(host);
      if(t instanceof HTMLTextAreaElement&&t.matches?.('textarea[data-slot="question-custom-input"]'))v2ApplyDir(t,v2RtlDir(t.value));
    },true);
    applyV2Rtl(document);
    observePierreDocViewers(null);
  }catch(err){console.warn("[v2-rtl] bootstrap failed",err);}
}
try{
  if(typeof document==="undefined"||!document.documentElement)globalThis.document?.addEventListener?.("DOMContentLoaded",bootstrapV2Rtl,{once:true});
  else bootstrapV2Rtl();
}catch(err){console.warn("[v2-rtl] bootstrap failed",err);}
/*END_V2_RTL_RUNTIME*/`
}

function dockTextHelpers(rtlClass) {
  return `const DOCK_TEXT_RTL = /${rtlClass}/;
const DOCK_TEXT_DIRECTION_SELECTOR = '[data-slot="question-text"], [data-slot="question-option"], [data-slot="answer-text"], textarea[data-slot="question-custom-input"], [data-slot="message-part-todo-content"], [data-slot="session-todo-preview"], [data-slot="session-todo-list"]';
const DOCK_TEXT_SCOPE_SELECTOR = '[data-component="session-question-dock"], [data-component="question-answers"], [data-component="todos"], [data-component="session-todo-dock"]';
function dockTextDirectionText(element) {
  const text2 = element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? "");
  const custom = element.querySelector?.('textarea[data-slot="question-custom-input"]');
  if (custom instanceof HTMLTextAreaElement && custom.value) return text2 + "\\n" + custom.value;
  return text2;
}
function applyDockTextDirections(root2) {
  const targets = [];
  if (root2 instanceof Element && root2.matches?.(DOCK_TEXT_DIRECTION_SELECTOR)) targets.push(root2);
  root2.querySelectorAll?.(DOCK_TEXT_DIRECTION_SELECTOR).forEach((element) => targets.push(element));
  targets.forEach((element) => {
    const next2 = DOCK_TEXT_RTL.test(dockTextDirectionText(element)) ? "rtl" : "ltr";
    if (element.getAttribute("dir") !== next2) element.setAttribute("dir", next2);
  });
}
function dockTextScopeFor(node) {
  if (!(node instanceof HTMLElement)) return null;
  if (node.matches?.(DOCK_TEXT_SCOPE_SELECTOR)) return node;
  return node.closest?.(DOCK_TEXT_SCOPE_SELECTOR) ?? null;
}
const dockTextDirectionObserver = new MutationObserver((mutations) => {
  const scopes = new Set();
  mutations.forEach((mutation) => {
    const scope = dockTextScopeFor(mutation.target);
    if (scope) scopes.add(scope);
    mutation.addedNodes.forEach((node) => {
      const added = dockTextScopeFor(node);
      if (added) scopes.add(added);
      if (node instanceof HTMLElement) node.querySelectorAll?.(DOCK_TEXT_SCOPE_SELECTOR).forEach((nested) => scopes.add(nested));
    });
  });
  scopes.forEach(applyDockTextDirections);
  observePierreDocViewers(mutations);
});
dockTextDirectionObserver.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (!target.matches('textarea[data-slot="question-custom-input"]')) return;
  const next2 = DOCK_TEXT_RTL.test(target.value ?? "") ? "rtl" : "ltr";
  if (target.getAttribute("dir") !== next2) target.setAttribute("dir", next2);
  const option = target.closest('[data-slot="question-option"]');
  if (option instanceof HTMLElement) applyDockTextDirections(option);
}, true);
applyDockTextDirections(document);`
}

function pierreHelpers() {
  return `const pierreDocShadowObservers = new WeakSet();
function pierreDocScopeFor(container) {
  const scope = container.closest?.('[data-component="file"][data-mode="text"][data-rtl="true"]');
  return scope instanceof HTMLElement ? scope : null;
}
function applyPierreDocLines(container) {
  if (pierreDocScopeFor(container) === null) return;
  const root2 = container.shadowRoot;
  if (!root2) return;
  root2.querySelectorAll?.("[data-line]").forEach((line) => {
    if (!(line instanceof HTMLElement)) return;
    if (line.hasAttribute("data-column-number")) return;
    if (line.getAttribute("dir") !== "rtl") line.setAttribute("dir", "rtl");
    if (line.style.textAlign !== "start") line.style.textAlign = "start";
  });
}
function watchPierreDocContainer(container) {
  applyPierreDocLines(container);
  const root2 = container.shadowRoot;
  if (!root2 || pierreDocShadowObservers.has(root2)) return;
  pierreDocShadowObservers.add(root2);
  new MutationObserver((shadowMutations) => {
    let fresh = false;
    shadowMutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.("[data-line]") || node.querySelector?.("[data-line]")) fresh = true;
      });
    });
    if (fresh) applyPierreDocLines(container);
  }).observe(root2, { childList: true, subtree: true });
}
function observePierreDocViewers(mutations) {
  const containers = new Set();
  const collect = (node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName.toLowerCase() === "diffs-container") containers.add(node);
    node.querySelectorAll?.("diffs-container").forEach((nested) => containers.add(nested));
  };
  if (!mutations) {
    document.querySelectorAll?.("diffs-container").forEach((node) => containers.add(node));
  } else {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(collect);
    });
  }
  containers.forEach(watchPierreDocContainer);
}
observePierreDocViewers(null);`
}

function findAsset(directory, pattern) {
  const matches = fs.readdirSync(directory).filter((name) => pattern.test(name))
  if (matches.length !== 1) throw new Error(`Expected exactly one ${pattern}, found ${matches.length}`)
  return path.join(directory, matches[0])
}

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText)
  if (first === -1) throw new Error(`Missing ${label}`)
  const second = text.indexOf(oldText, first + oldText.length)
  if (second !== -1) throw new Error(`Ambiguous ${label}`)
  return text.slice(0, first) + newText + text.slice(first + oldText.length)
}

function patchPromptTemplate(text) {
  const marker = "data-component=prompt-input role=textbox"
  const candidates = []
  let cursor = 0
  while (true) {
    const start = text.indexOf(marker, cursor)
    if (start === -1) break
    const end = text.indexOf("></div>", start)
    if (end === -1) throw new Error("Missing prompt editor template end")
    const original = text.slice(start, end)
    if (original.includes("text-[13px]")) candidates.push({ start, end, original })
    cursor = start + marker.length
  }
  if (candidates.length !== 1) throw new Error(`Expected one V2 prompt editor template, found ${candidates.length}`)
  const { start, end, original } = candidates[0]
  let updated = replaceOnce(original, "autocomplete=off", "autocomplete=off dir=auto", "prompt editor direction attribute")
  updated = replaceOnce(updated, "text-[13px]", "text-[16px]", "prompt editor font")
  updated = replaceOnce(updated, "font-[440]", "font-sans font-[440]", "prompt editor font family")
  // Post-build Tailwind cannot generate a new text-[16px] utility, so pin the size inline.
  updated += " style=font-size:16px;text-align:start"
  return text.slice(0, start) + updated + text.slice(end)
}

function patchTemplateFont(text, templateName, label) {
  const start = text.indexOf(`${templateName} = `)
  if (start === -1) throw new Error(`Missing ${label} template`)
  const end = text.indexOf("`),", start)
  if (end === -1) throw new Error(`Missing ${label} template end`)
  const block = text.slice(start, end)
  let updated = replaceOnce(block, "text-[13px]", "text-[16px]", label)
  updated = replaceOnce(updated, "font-[440]", "font-sans font-[440]", `${label} family`)
  // Post-build Tailwind cannot generate a new text-[16px] utility, so pin the size inline.
  updated = replaceOnce(updated, "<div ", '<div style="font-size:16px;" ', `${label} inline size`)
  return text.slice(0, start) + updated + text.slice(end)
}

function updateCssBlock(text, selector, label, update) {
  const start = text.indexOf(selector)
  if (start === -1) throw new Error(`Missing ${label} selector`)
  const open = text.indexOf("{", start)
  const close = text.indexOf("\n  }", open)
  if (open === -1 || close === -1) throw new Error(`Missing ${label} block`)
  const block = text.slice(start, close)
  const updated = update(block)
  if (updated === block) throw new Error(`No change made to ${label}`)
  return text.slice(0, start) + updated + text.slice(close)
}

// Minified-CSS variant (v2 ships one-line rules without spaces/quotes).
function updateMinCssBlock(text, selector, label, update) {
  const start = text.indexOf(selector)
  if (start === -1) throw new Error(`Missing ${label} selector`)
  const open = text.indexOf("{", start)
  const close = text.indexOf("}", open)
  if (open === -1 || close === -1) throw new Error(`Missing ${label} block`)
  const block = text.slice(start, close)
  const updated = update(block)
  if (updated === block) throw new Error(`No change made to ${label}`)
  return text.slice(0, start) + updated + text.slice(close)
}

function addDeclaration(block, declaration, label) {
  if (block.includes(declaration)) throw new Error(`Already patched ${label}`)
  return `${block}\n${declaration}`
}

function addMinDeclaration(block, declaration, label) {
  if (block.includes(declaration)) throw new Error(`Already patched ${label}`)
  return `${block};${declaration}`
}

function addDeclarations(block, declarations, label) {
  let updated = block
  for (const declaration of declarations) updated = addDeclaration(updated, declaration, label)
  return updated
}

function patchUnsafeCss(text) {
  const start = text.indexOf("const unsafeCSS = `")
  if (start === -1) throw new Error("Missing Pierre unsafeCSS")
  const end = text.indexOf("`;", start)
  if (end === -1) throw new Error("Missing Pierre unsafeCSS end")
  const block = text.slice(start, end)
  const marker = "  --diffs-bg-selection-text: rgb(from var(--diffs-selection-base) r g b / 0.2);\n}"
  const addition = `${marker}

[data-diff] [data-line],
[data-file] [data-line] {
  direction: var(--opencode-line-dir, ltr);
  unicode-bidi: var(--opencode-line-bidi, normal);
  text-align: var(--opencode-line-align, left);
}

[data-diff] [data-column-number],
[data-file] [data-column-number] {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: right;
}`
  const patched = replaceOnce(block, marker, addition, "Pierre line direction CSS")
  return text.slice(0, start) + patched + text.slice(end)
}

// ---------------------------------------------------------------------------
// RTL-2 isolation (optional, --rtl2).
//
// Turns the patched app into a fully independent second install:
//   - out/main/index.js: prod app id `ai.opencode.desktop` ->
//     `ai.opencode.desktop.rtl2` (own Electron userData, single-instance lock,
//     stores, logs, crashpad, staged CLI) and the window/menu name ->
//     `OpenCode-RTL-2`. It also pins the isolated XDG homes at process start —
//     before any background-service probe runs — so the probe and the daemon
//     never touch the shared `~/.local/state|~/.local/share|~/.config/service`
//     files of other installs:
//       <userData>               XDG_STATE_HOME  -> state (service registration)
//       <userData>/data          XDG_DATA_HOME   -> sessions DB, logs, snapshots
//       <userData>/config        XDG_CONFIG_HOME -> service config + opencode config
//       <userData>/cache         XDG_CACHE_HOME
//   - desktop main chunk: the same XDG defaults are re-applied in the
//     shell-env step (belt and braces, marker RTL2_ISOLATION:"v1") and the
//     spawned `opencode-cli serve --service` daemon gets `--port 49375` so it
//     never competes with other installs for the built-in 49374 managed port.
// ---------------------------------------------------------------------------

const RTL2_APP_ID = "ai.opencode.desktop.rtl2"
const RTL2_SERVICE_PORT = "49375"

function patchRtl2Isolation(root) {
  const mainDir = path.join(root, "out", "main")
  const indexJs = path.join(mainDir, "index.js")
  if (!fs.existsSync(indexJs)) throw new Error("RTL-2 isolation requires the v2 layout (out/main/index.js)")
  if (fs.readFileSync(indexJs, "utf8").includes(RTL2_APP_ID)) throw new Error("Already patched RTL-2 isolation (index.js)")

  let index = fs.readFileSync(indexJs, "utf8")
  index = replaceOnce(
    index,
    "{dev:`OpenCode Dev`,beta:`OpenCode Beta`,prod:`OpenCode`}",
    "{dev:`OpenCode Dev`,beta:`OpenCode Beta`,prod:`OpenCode-RTL-2`}",
    "RTL-2 app name map",
  )
  index = replaceOnce(
    index,
    "{dev:`ai.opencode.desktop.dev`,beta:`ai.opencode.desktop.beta`,prod:`ai.opencode.desktop`}",
    "{dev:`ai.opencode.desktop.dev`,beta:`ai.opencode.desktop.beta`,prod:`" + RTL2_APP_ID + "`}",
    "RTL-2 app id map",
  )
  index = replaceOnce(
    index,
    "OPENCODE_DISABLE_EMBEDDED_WEB_UI=`true`,",
    "OPENCODE_DISABLE_EMBEDDED_WEB_UI=`true`," + rtl2EnvDefaults() + ",",
    "RTL-2 process environment",
  )
  fs.writeFileSync(indexJs, index)

  const desktop = findMainChunk(mainDir, "v2 CLI background service ready", "desktop chunk")
  let text = fs.readFileSync(desktop, "utf8")
  if (text.includes("RTL2_ISOLATION")) throw new Error("Already patched RTL-2 isolation (desktop chunk)")
  const base = 'process.env.HOME+"/Library/Application Support/' + RTL2_APP_ID + '"'
  text = replaceOnce(
    text,
    "OPENCODE_CLIENT:`desktop`}",
    "OPENCODE_CLIENT:`desktop`," +
      "XDG_STATE_HOME:process.env.XDG_STATE_HOME??" + base + "," +
      'XDG_DATA_HOME:process.env.XDG_DATA_HOME??' + base + '+"/data",' +
      'XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME??' + base + '+"/config",' +
      'XDG_CACHE_HOME:process.env.XDG_CACHE_HOME??' + base + '+"/cache",' +
      'RTL2_ISOLATION:"v1"}',
    "RTL-2 isolated XDG environment",
  )
  text = replaceOnce(
    text,
    "[`--hostname`,`0.0.0.0`,`--port`,`3084`]:[]]",
    "[`--hostname`,`0.0.0.0`,`--port`,`3084`]:[`--port`,`" + RTL2_SERVICE_PORT + "`]]",
    "RTL-2 service port",
  )
  fs.writeFileSync(desktop, text)

  console.log(`Patched RTL-2 isolation: index.js + ${path.basename(desktop)}`)
}

function rtl2EnvDefaults() {
  const base = 'process.env.HOME+"/Library/Application Support/' + RTL2_APP_ID + '"'
  const part = (name, suffix) =>
    "process.env." + name + "||(process.env." + name + "=" + base + (suffix ? '+"/' + suffix + '"' : "") + ")"
  return [
    part("XDG_STATE_HOME"),
    part("XDG_DATA_HOME", "data"),
    part("XDG_CONFIG_HOME", "config"),
    part("XDG_CACHE_HOME", "cache"),
  ].join(",")
}

function findMainChunk(mainDir, marker, label) {
  const hits = fs
    .readdirSync(mainDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(mainDir, name))
    .filter((file) => fs.readFileSync(file, "utf8").includes(marker))
  if (hits.length !== 1) throw new Error(`Expected exactly one ${label} containing ${marker}, found ${hits.length}`)
  return hits[0]
}

if (isRtl2) patchRtl2Isolation(unpacked)

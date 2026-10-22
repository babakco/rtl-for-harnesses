import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasRTL, detectDir } from '../payload/rtl-detect.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const domSrc = readFileSync(path.join(root, 'payload/rtl-dom.js'), 'utf8');
const dom = new Function('hasRTL', 'detectDir', domSrc + '\nreturn { isExcluded: isExcluded, processTextNode: processTextNode, scanRoot: scanRoot, findBlock: findBlock };')(hasRTL, detectDir);
const { isExcluded, processTextNode, scanRoot, findBlock } = dom;

function makeEl(tagName, className, closestHits) {
  return {
    tagName: tagName,
    className: className,
    closest: (sel) => closestHits.some((hit) => sel.indexOf(hit) !== -1)
  };
}

function makeBlock(tagName, closestHits) {
  const el = makeEl(tagName, '', closestHits || []);
  el.nodeType = 1;
  el.parentElement = null;
  el._dir = null;
  el.hasAttribute = (name) => name === 'dir' && el._dir !== null;
  el.setAttribute = (name, value) => {
    if (name === 'dir') {
      el._dir = value;
    }
  };
  return el;
}

function runScanRoot(textNodes) {
  let idx = 0;
  const prev = globalThis.document;
  globalThis.document = {
    createTreeWalker: () => ({
      nextNode: () => (idx < textNodes.length ? textNodes[idx++] : null)
    })
  };
  try {
    scanRoot({});
  } finally {
    if (prev === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = prev;
    }
  }
}

test('dom fragment is a plain script without imports or exports', () => {
  assert.ok(!/^\s*import\s/m.test(domSrc), 'must not contain import statements');
  assert.ok(!/^\s*export\s/m.test(domSrc), 'must not contain export statements');
  assert.ok(domSrc.includes('MutationObserver'), 'must contain a MutationObserver loop');
  assert.ok(domSrc.includes('200'), 'must cap the batched roots');
});

test('inline code inside Persian prose is excluded and skipped', () => {
  assert.equal(isExcluded(makeEl('CODE', '', [])), true);
  assert.equal(processTextNode('نمایش کد', makeEl('CODE', '', [])), 'skip');
});

test('pre and code-like tags are excluded', () => {
  assert.equal(isExcluded(makeEl('PRE', '', [])), true);
  assert.equal(isExcluded(makeEl('KBD', '', [])), true);
  assert.equal(isExcluded(makeEl('SAMP', '', [])), true);
});

test('Persian span resolves to rtl', () => {
  assert.equal(isExcluded(makeEl('SPAN', '', [])), false);
  assert.equal(processTextNode('سلام دنیا', makeEl('SPAN', '', [])), 'rtl');
});

test('span under a language- ancestor is skipped', () => {
  assert.equal(isExcluded(makeEl('SPAN', '', ['[class*=language-]'])), true);
  assert.equal(processTextNode('const x = 1;', makeEl('SPAN', 'language-js', [])), 'skip');
});

test('Persian button is excluded', () => {
  assert.equal(isExcluded(makeEl('BUTTON', '', [])), true);
  assert.equal(processTextNode('ارسال پیام فارسی', makeEl('BUTTON', '', [])), 'skip');
});

test('form controls and links are excluded', () => {
  assert.equal(isExcluded(makeEl('A', '', [])), true);
  assert.equal(isExcluded(makeEl('INPUT', '', [])), true);
  assert.equal(isExcluded(makeEl('TEXTAREA', '', [])), true);
  assert.equal(isExcluded(makeEl('SELECT', '', [])), true);
  assert.equal(isExcluded(makeEl('SVG', '', [])), true);
});

test('math renderers are excluded', () => {
  assert.equal(isExcluded(makeEl('SPAN', 'katex-display', [])), true);
  assert.equal(isExcluded(makeEl('MATH', '', [])), true);
  assert.equal(isExcluded(makeEl('SPAN', '', ['mjx-container'])), true);
});

test('icon and role-button markers are excluded', () => {
  assert.equal(isExcluded(makeEl('SPAN', 'menu-icon', [])), true);
  assert.equal(isExcluded(makeEl('DIV', '', ['[role=button]'])), true);
  assert.equal(isExcluded(makeEl('DIV', '', ['[class*=icon]'])), true);
});

test('line starting with Latin tag resolves to rtl in a paragraph', () => {
  assert.equal(isExcluded(makeEl('P', '', [])), false);
  assert.equal(processTextNode('[fa] فارسی', makeEl('P', '', [])), 'rtl');
});

test('pure English paragraph resolves to ltr', () => {
  assert.equal(processTextNode('Hello world, no Persian here', makeEl('P', '', [])), 'ltr');
});

test('empty text resolves to ltr and never to skip outside exclusions', () => {
  assert.equal(processTextNode('', makeEl('DIV', '', [])), 'ltr');
});

test('scanRoot sets dir=rtl on a Persian paragraph and leaves English alone', () => {
  const faBlock = makeBlock('P', []);
  const enBlock = makeBlock('P', []);
  const nodes = [
    { nodeValue: 'سلام دنیا', parentElement: faBlock },
    { nodeValue: 'Hello world, no Persian here', parentElement: enBlock }
  ];
  runScanRoot(nodes);
  assert.equal(faBlock._dir, 'rtl');
  assert.equal(enBlock.hasAttribute('dir'), false);
});

test('[role=button] content is skipped by both processTextNode and scanRoot', () => {
  assert.equal(processTextNode('سلام دنیا', makeEl('DIV', '', ['[role=button]'])), 'skip');
  const roleBlock = makeBlock('P', ['[role=button]']);
  runScanRoot([{ nodeValue: 'سلام دنیا', parentElement: roleBlock }]);
  assert.equal(roleBlock.hasAttribute('dir'), false);
});

function makeChainEl(tagName) {
  return { tagName: tagName, nodeType: 1, className: '', parentElement: null, closest: () => null };
}

test('findBlock climbs past an inline span to the paragraph', () => {
  const p = makeBlock('P', []);
  const span = makeChainEl('SPAN');
  span.parentElement = p;
  assert.equal(findBlock(span), p);
});

test('scanRoot sets dir on the paragraph when Persian text sits in a nested span', () => {
  const p = makeBlock('P', []);
  const span = makeChainEl('SPAN');
  span.parentElement = p;
  runScanRoot([{ nodeValue: 'OpenCode فارسی است', parentElement: span }]);
  assert.equal(p._dir, 'rtl');
});

test('scanRoot never sets dir on BODY even for direct Persian text', () => {
  const body = makeBlock('BODY', []);
  runScanRoot([{ nodeValue: 'سلام دنیا', parentElement: body }]);
  assert.equal(body.hasAttribute('dir'), false);
});

test('scanRoot survives a throwing querySelectorAll during shadow traversal', () => {
  const p = makeBlock('P', []);
  const nodes = [{ nodeValue: 'سلام دنیا', parentElement: p }];
  let idx = 0;
  const prev = globalThis.document;
  globalThis.document = {
    createTreeWalker: () => ({
      nextNode: () => (idx < nodes.length ? nodes[idx++] : null)
    })
  };
  try {
    scanRoot({ querySelectorAll: () => { throw new Error('denied'); } });
  } finally {
    if (prev === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = prev;
    }
  }
  assert.equal(p._dir, 'rtl');
});

test('scanRoot skips already-observed shadow roots without recursing', () => {
  const p = makeBlock('P', []);
  const nodes = [{ nodeValue: 'سلام دنیا', parentElement: p }];
  let idx = 0;
  let observed = 0;
  const prev = globalThis.document;
  globalThis.document = {
    createTreeWalker: () => ({
      nextNode: () => (idx < nodes.length ? nodes[idx++] : null)
    })
  };
  try {
    scanRoot({ querySelectorAll: () => [{ shadowRoot: { __codexRtlObserved: 1 } }] }, () => { observed++; });
  } finally {
    if (prev === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = prev;
    }
  }
  assert.equal(p._dir, 'rtl');
  assert.equal(observed, 0);
});

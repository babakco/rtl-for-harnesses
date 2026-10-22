// ===========================================================================
// GitHub Copilot RTL Patch — Vazirmatn font + Smart RTL Detection
// Target: /Applications/GitHub Copilot.app (v1.1.15+, AppKit + WKWebView)
// Injected into every WKWebView via copilot_rtl_inject.dylib (WKUserScript)
//
// What it does:
//   1. Loads Vazirmatn (@font-face, base64-embedded by build.sh) and applies
//      it to chat text + input boxes (code blocks keep monospace).
//   2. Per-block RTL: if a paragraph/sentence contains ANY Persian/Arabic
//      character, the whole block becomes RTL — even if it starts with
//      English words. (User requirement.)
//   3. Sidebar / chat-list / menus are EXCLUDED: they are forced LTR so the
//      right-side menu stays readable and does not jump around.
//   4. Code blocks (pre/code) and math are forced LTR.
//   5. Live: input boxes switch direction as you type; streaming responses
//      are processed via MutationObserver.
// ===========================================================================
;(function() {
    'use strict';
    if (typeof document === 'undefined') return;
    try {

        // ---- Selectors -----------------------------------------------------
        // Sidebar / navigation / menus: NEVER RTL. Forced LTR.
        var SIDEBAR_SEL = [
            'nav', 'aside', 'header',
            '[role="navigation"]', '[role="complementary"]', '[role="menu"]',
            '[role="menubar"]', '[role="tree"]', '[role="listbox"]',
            '[class*="sidebar"]', '[class*="Sidebar"]', '[class*="SideBar"]',
            '[class*="nav-"]', '[class*="Nav-"]', '[class*="navbar"]',
            '[class*="menu"]', '[class*="Menu"]',
            '[data-testid*="sidebar"]', '[data-testid*="Sidebar"]',
            '[data-testid*="nav"]', '[data-testid*="chat-list"]',
            '[data-testid*="session-list"]', '[data-testid*="history"]',
            '[data-tauri-drag-region]'
        ].join(',');

        var MATH_SEL = '.katex, .katex-display, mjx-container, math, .math, .math-inline, .math-display';
        var CODE_SEL = 'pre, code';

        // ---- RTL character detection ---------------------------------------
        // Arabic (0600-06FF, includes Persian), Arabic Supplement (0750-077F),
        // Arabic Extended (08A0-08FF), Presentation Forms (FB50-FDFF, FE70-FEFF),
        // Hebrew (0590-05FF, harmless to include).
        function isRTLChar(c) {
            var code = c.charCodeAt(0);
            return (code >= 0x0590 && code <= 0x05FF) ||
                   (code >= 0x0600 && code <= 0x06FF) ||
                   (code >= 0x0750 && code <= 0x077F) ||
                   (code >= 0x08A0 && code <= 0x08FF) ||
                   (code >= 0xFB50 && code <= 0xFDFF) ||
                   (code >= 0xFE70 && code <= 0xFEFF);
        }

        function hasRTL(text) {
            if (!text) return false;
            for (var i = 0; i < text.length; i++) {
                if (isRTLChar(text[i])) return true;
            }
            return false;
        }

        // Text of an element, ignoring code children (so a code sample that
        // happens to contain an Arabic string does not flip the paragraph).
        function textWithoutCode(el) {
            var out = '';
            var nodes = el.childNodes;
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                if (n.nodeType === 3) { out += n.textContent; }
                else if (n.nodeType === 1 && n.tagName !== 'CODE' &&
                         n.tagName !== 'PRE' && n.tagName !== 'SVG') {
                    out += textWithoutCode(n);
                }
            }
            return out;
        }

        function inSidebar(el) {
            return !!(el.closest && el.closest(SIDEBAR_SEL));
        }

        function inCode(el) {
            return !!(el.closest && el.closest('pre, code'));
        }

        // User rule: ANY Persian char in the block => whole block RTL,
        // even when the block starts with English.
        function detectBlockDir(el) {
            if (inSidebar(el) || inCode(el)) return null;
            var t = textWithoutCode(el);
            if (!t || !t.trim()) return null;
            return hasRTL(t) ? 'rtl' : null;
        }

        function detectTextDir(text) {
            if (!text || !text.trim()) return 'ltr';
            return hasRTL(text) ? 'rtl' : 'ltr';
        }

        function qsa(root, sel) {
            var base = (root && root.querySelectorAll) ? root : document;
            var els = Array.prototype.slice.call(base.querySelectorAll(sel));
            if (root && root.matches && root.matches(sel)) els.unshift(root);
            return els;
        }

        // ---- Processors ----------------------------------------------------
        function processText(root) {
            qsa(root, 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, summary, dt, dd, figcaption').forEach(function(el) {
                if (el.closest(MATH_SEL)) return;
                if (inSidebar(el) || inCode(el)) return;
                var dir = detectBlockDir(el);
                if (dir === 'rtl') {
                    el.setAttribute('dir', 'rtl');
                    el.style.direction = 'rtl';
                    el.style.textAlign = 'right';
                    if (el.tagName === 'LI') {
                        el.style.listStylePosition = 'inside';
                        var pl = el.closest('ul, ol');
                        if (pl && !pl.hasAttribute('dir')) {
                            pl.setAttribute('dir', 'rtl');
                            pl.style.direction = 'rtl';
                            var pad = getComputedStyle(pl).paddingLeft;
                            if (parseFloat(pad) > 0) {
                                pl.style.paddingRight = pad;
                                pl.style.paddingLeft = '0';
                            }
                        }
                    }
                } else {
                    if (el.hasAttribute('dir')) el.removeAttribute('dir');
                    el.style.direction = '';
                    el.style.textAlign = '';
                    if (el.tagName === 'LI') el.style.listStylePosition = '';
                }
            });

            qsa(root, 'ul, ol').forEach(function(el) {
                if (inSidebar(el) || inCode(el)) return;
                var dir = detectBlockDir(el);
                if (dir === 'rtl') {
                    el.setAttribute('dir', 'rtl');
                    el.style.direction = 'rtl';
                    var pad = getComputedStyle(el).paddingLeft;
                    if (parseFloat(pad) > 0) {
                        el.style.paddingRight = pad;
                        el.style.paddingLeft = '0';
                    }
                } else {
                    if (el.hasAttribute('dir')) el.removeAttribute('dir');
                    el.style.direction = '';
                    el.style.paddingRight = '';
                    el.style.paddingLeft = '';
                }
            });
        }

        // Leaf-level containers (message bubbles, spans) that hold text but
        // no nested block structure.
        function processContainers(root) {
            qsa(root, 'div, span').forEach(function(el) {
                if (inSidebar(el) || inCode(el) || el.closest(MATH_SEL)) return;
                if (el.querySelector('p, div, ul, ol, h1, h2, h3, h4, h5, h6, pre, table, li, blockquote')) return;
                if (/^(P|LI|H[1-6]|BLOCKQUOTE|TD|TH|UL|OL)$/.test(el.tagName)) return;
                var text = (el.textContent || '').trim();
                if (text.length < 2) return;
                if (hasRTL(text)) {
                    el.setAttribute('dir', 'rtl');
                    el.style.textAlign = 'right';
                } else if (el.hasAttribute('dir')) {
                    el.removeAttribute('dir');
                    el.style.textAlign = '';
                }
            });
        }

        // Sidebar / menus / chat list: always LTR, always left-aligned.
        function forceSidebarLTR(root) {
            qsa(root, SIDEBAR_SEL).forEach(function(el) {
                el.setAttribute('dir', 'ltr');
                el.style.direction = 'ltr';
                el.querySelectorAll('p, li, div, span, a, button').forEach(function(c) {
                    if (c.hasAttribute('dir')) c.removeAttribute('dir');
                    c.style.direction = '';
                });
            });
        }

        function forceCodeLTR(root) {
            qsa(root, 'pre').forEach(function(b) {
                b.setAttribute('dir', 'ltr');
                b.style.direction = 'ltr';
                b.style.textAlign = 'left';
                b.style.unicodeBidi = 'embed';
            });
            qsa(root, 'code').forEach(function(c) {
                c.setAttribute('dir', 'ltr');
                c.style.direction = 'ltr';
                c.style.unicodeBidi = 'isolate';
            });
            qsa(root, MATH_SEL).forEach(function(el) {
                el.setAttribute('dir', 'ltr');
            });
        }

        // Input boxes (composer + any textarea/input/contenteditable):
        // direction follows content; Persian anywhere => RTL.
        function applyInputDir(t) {
            var text = t.textContent || t.innerText || t.value || '';
            var dir = detectTextDir(text);
            if (dir === 'rtl') {
                t.style.direction = 'rtl';
                t.style.textAlign = 'right';
            } else {
                t.style.direction = 'ltr';
                t.style.textAlign = 'left';
            }
        }

        function processInputs(root) {
            qsa(root, 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [contenteditable=""]').forEach(function(t) {
                if (inSidebar(t)) return;
                applyInputDir(t);
            });
        }

        function processAll() {
            if (!document.body) return;
            processText(document);
            processContainers(document.body);
            processInputs(document);
            forceSidebarLTR(document.body);
            forceCodeLTR(document.body);
        }

        // ---- Styles (font + direction defaults) -----------------------------
        function injectStyles() {
            if (document.getElementById('copilot-rtl-styles')) return;
            var s = document.createElement('style');
            s.id = 'copilot-rtl-styles';
            s.textContent = [
                '/* Vazirmatn (embedded woff2, OFL licensed) */',
                '@font-face{font-family:"Vazirmatn";font-style:normal;font-weight:400;font-display:swap;src:url(data:font/woff2;base64,__VAZIRMATN_REGULAR_B64__) format("woff2")}',
                '@font-face{font-family:"Vazirmatn";font-style:normal;font-weight:700;font-display:swap;src:url(data:font/woff2;base64,__VAZIRMATN_BOLD_B64__) format("woff2")}',
                /* Chat text + inputs use Vazirmatn; UI chrome keeps system font */
                'textarea,input,[contenteditable="true"],[contenteditable=""]{font-family:"Vazirmatn",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif!important}',
                'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,summary,dt,dd,figcaption{font-family:"Vazirmatn",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif!important}',
                /* Natural bidi for untouched blocks */
                'p:not([dir]),li:not([dir]),blockquote:not([dir]),td:not([dir]),th:not([dir]){unicode-bidi:plaintext!important;text-align:start!important}',
                /* Sidebar / navigation / menus: hard LTR */
                'nav,aside,header,[role="navigation"],[role="complementary"],[role="menu"],[role="menubar"],[role="tree"]{direction:ltr!important;text-align:left!important}',
                /* Code + math: hard LTR + monospace */
                'pre,code{direction:ltr!important;text-align:left!important;unicode-bidi:embed!important;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important}',
                '.katex,.katex-display,mjx-container,math{direction:ltr!important;unicode-bidi:isolate!important}',
                /* Explicit dir attributes always win */
                '[dir="rtl"]{direction:rtl!important}',
                '[dir="ltr"]{direction:ltr!important}'
            ].join('\n');
            (document.head || document.documentElement).appendChild(s);
        }

        // ---- Init + live observers -------------------------------------------
        function init() {
            injectStyles();
            processAll();

            // Live direction for everything you type.
            document.addEventListener('input', function(e) {
                var t = e.target;
                if (!t || !(t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
                if (inSidebar(t)) return;
                applyInputDir(t);
            }, true);

            // Streaming responses: process only what changed.
            var pending = [];
            var obs = new MutationObserver(function(muts) {
                var touched = false;
                for (var i = 0; i < muts.length; i++) {
                    if (muts[i].addedNodes.length > 0 || muts[i].type === 'characterData') { touched = true; break; }
                }
                if (!touched) return;
                for (var j = 0; j < muts.length; j++) pending.push(muts[j]);
                if (window._copilotRtlT) return;
                window._copilotRtlT = setTimeout(function() {
                    window._copilotRtlT = null;
                    var batch = pending;
                    pending = [];
                    var roots = new Set();
                    batch.forEach(function(m) {
                        m.addedNodes.forEach(function(n) { if (n.nodeType === 1) roots.add(n); });
                        if (m.type === 'characterData' && m.target.parentElement) roots.add(m.target.parentElement);
                    });
                    var expanded = new Set(roots);
                    roots.forEach(function(r) {
                        if (!r.closest) return;
                        var t = r.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th');
                        if (t) expanded.add(t);
                        var l = r.closest('ul, ol');
                        if (l) expanded.add(l);
                    });
                    if (expanded.size > 0 && expanded.size <= 30) {
                        expanded.forEach(function(r) {
                            processText(r);
                            processContainers(r);
                            forceCodeLTR(r);
                        });
                        processInputs(document);
                        forceSidebarLTR(document.body);
                    } else {
                        processAll();
                    }
                }, 60);
            });
            if (document.body) {
                obs.observe(document.body, { childList: true, subtree: true, characterData: true });
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else { init(); }
    } catch (e) { console.error('[Copilot RTL]', e); }
})();

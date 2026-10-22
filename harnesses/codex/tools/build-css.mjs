import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FONT_FILES = [
  { file: 'Vazirmatn-Regular.woff2', weight: 400 },
  { file: 'Vazirmatn-Medium.woff2', weight: 500 },
  { file: 'Vazirmatn-Bold.woff2', weight: 700 }
];

const TEXT_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,summary,label,legend,dt,dd,figcaption,caption,span,div';
const FONT_STACK = "'Vazirmatn',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

export function fontFaceBlock(weight, base64) {
  return "@font-face{font-family:'Vazirmatn';font-style:normal;font-weight: " + weight + ";font-display:swap;src:url(data:font/woff2;base64," + base64 + ") format('woff2');}";
}

export function buildCss(fontsDir, outCssPath) {
  const faces = FONT_FILES.map((entry) => {
    const base64 = readFileSync(path.join(fontsDir, entry.file)).toString('base64');
    return fontFaceBlock(entry.weight, base64);
  });
  const css = faces.join('\n') + '\n'
    + TEXT_SELECTOR + '{font-family:' + FONT_STACK + ';}\n'
    + '[dir="rtl"]{direction:rtl;text-align:right;}\n'
    + 'button,a,input,textarea,select,svg,[role=button],[class*=icon]{font-family:inherit;}\n'
    + 'pre,code,kbd,samp{direction:ltr;text-align:left;unicode-bidi:isolate;}\n'
    + '.katex,.katex-display,mjx-container,math{direction:ltr;unicode-bidi:isolate;}\n'
    + 'ul,ol{list-style-position:inside;}\n'
    + '[dir="rtl"] ul,[dir="rtl"] ol{padding-right:1.5em;padding-left:0;}\n'
    + 'pre,code,kbd,samp,[class*=language-]{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}\n';
  mkdirSync(path.dirname(outCssPath), { recursive: true });
  writeFileSync(outCssPath, css, 'utf8');
  return css;
}

const invoked = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  const args = process.argv.slice(2);
  const fontsDir = args[args.indexOf('--fonts') + 1];
  const outCssPath = args[args.indexOf('--out') + 1];
  if (!fontsDir || !outCssPath) {
    process.stderr.write('usage: build-css.mjs --fonts <dir> --out <file>\n');
    process.exit(1);
  }
  buildCss(fontsDir, outCssPath);
}

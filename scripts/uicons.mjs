// Menyusun src/styles/uicons.css dari glyph yang dipakai di src/lib/glyphs.tsx.
// Berkas font tetap utuh; hanya aturan kelas untuk glyph yang dipakai yang ditulis.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules/@flaticon/flaticon-uicons/css');
const source = readFileSync(join(root, 'src/lib/glyphs.tsx'), 'utf8');

const regular = new Set();
const solid = new Set();
for (const m of source.matchAll(/glyph\('([\w-]+)'(?:,\s*('[\w-]+'|null))?(?:,\s*(?:'[\w-]+'|null),\s*\d+)?\)/g)) {
  regular.add(m[1]);
  if (m[2] === undefined) solid.add(m[1]);
  else if (m[2] !== 'null') solid.add(m[2].slice(1, -1));
}

function load(style) {
  const css = readFileSync(join(pkg, style, 'rounded.css'), 'utf8');
  const font = css.match(/url\(\.\.\/(uicons-[\w-]+\.woff2)\)/)[1];
  const codes = new Map([...css.matchAll(/\.fi-(?:rr|sr)-([\w-]+):before\{content:"([^"]+)"\}/g)].map((m) => [m[1], m[2]]));
  return { font, codes };
}

const rr = load('regular');
const sr = load('solid');

const out = [];
const rules = (prefix, names, codes) => {
  for (const n of [...names].sort()) {
    const code = codes.get(n);
    if (!code) throw new Error(`Ikon tidak ditemukan: fi-${prefix}-${n}`);
    out.push(`.fi-${prefix}-${n}:before{content:"${code}"}`);
  }
};

out.push(
  `@font-face{font-family:uicons-regular-rounded;src:url(../../node_modules/@flaticon/flaticon-uicons/css/${rr.font}) format("woff2");font-display:swap}`,
  `@font-face{font-family:uicons-solid-rounded;src:url(../../node_modules/@flaticon/flaticon-uicons/css/${sr.font}) format("woff2");font-display:swap}`,
  `i[class^=fi-rr-]:before,i[class*=" fi-rr-"]:before{font-family:uicons-regular-rounded!important}`,
  `i[class^=fi-sr-]:before,i[class*=" fi-sr-"]:before{font-family:uicons-solid-rounded!important}`,
  `i[class^=fi-rr-]:before,i[class*=" fi-rr-"]:before,i[class^=fi-sr-]:before,i[class*=" fi-sr-"]:before{font-style:normal;font-weight:400!important;font-variant:normal;text-transform:none;line-height:1;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`,
);
rules('rr', regular, rr.codes);
rules('sr', solid, sr.codes);

const header = '/* Dihasilkan oleh scripts/uicons.mjs dari src/lib/glyphs.tsx. Flaticon UIcons — https://www.flaticon.com/uicons */\n';
const target = join(root, 'src/styles/uicons.css');
const next = header + out.join('\n') + '\n';

if (process.argv.includes('--check')) {
  if (!existsSync(target) || readFileSync(target, 'utf8') !== next) {
    console.error('src/styles/uicons.css tidak sesuai dengan src/lib/glyphs.tsx. Jalankan: npm run uicons');
    process.exit(1);
  }
} else {
  writeFileSync(target, next);
  console.log(`uicons.css: ${regular.size} ikon regular, ${solid.size} ikon solid`);
}

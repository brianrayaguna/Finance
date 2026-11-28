// Penjaga gaya: menahan utang tata letak agar tidak bertambah.
//
//   node scripts/css-guard.mjs            bandingkan dengan scripts/css-guard.baseline.json (dipakai `npm run check`)
//   node scripts/css-guard.mjs --update   tulis ulang angka dasar setelah utang berkurang
//
// Metrik:
//   offScaleMedia  media query lebar di luar kelas ukuran jendela (src/app/breakpoints.ts): hanya sintaks
//                  rentang dengan batas 600px dan 1024px yang sah. Komponen memakai container query.
//   important      deklarasi `!important`.
//   fixedHeight    `height: Npx` — tinggi tetap memotong teks saat huruf diperbesar; pakai min-height + padding.
//   inlineStyle    `style={{` di TSX — gaya statis milik kelas CSS; nilai dinamis lewat variabel CSS.
//
// Angka yang naik menggagalkan pemeriksaan. Angka yang turun juga gagal sampai angka dasar diperbarui,
// sehingga perbaikan terkunci dan tidak bisa mundur diam-diam.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WINDOW_BOUNDS = new Set([600, 1024]);
const METRICS = ['offScaleMedia', 'important', 'fixedHeight', 'inlineStyle'];

/** Media query yang memakai lebar di luar batas kelas ukuran jendela, dengan nomor barisnya. */
export function offScaleMedia(css) {
  const found = [];
  for (const m of css.matchAll(/@media([^{]*)\{/g)) {
    const prelude = m[1];
    if (!/width/.test(prelude)) continue;
    const legacy = /\b(?:min|max)-width\b/.test(prelude);
    const values = [...prelude.matchAll(/(\d+(?:\.\d+)?)px/g)].map((v) => Number(v[1]));
    if (legacy || values.some((v) => !WINDOW_BOUNDS.has(v))) {
      found.push({ line: css.slice(0, m.index).split('\n').length, query: prelude.trim() });
    }
  }
  return found;
}

export function countCss(css) {
  return {
    important: (css.match(/!important/g) ?? []).length,
    fixedHeight: (css.match(/(?<![\w-])height\s*:\s*\d+(?:\.\d+)?px/g) ?? []).length,
  };
}

export function countTsx(tsx) {
  return { inlineStyle: (tsx.match(/style=\{\{/g) ?? []).length };
}

export function compareToBaseline(now, base) {
  const increased = [];
  const decreased = [];
  for (const key of METRICS) {
    if (now[key] > base[key]) increased.push({ key, now: now[key], base: base[key] });
    else if (now[key] < base[key]) decreased.push({ key, now: now[key], base: base[key] });
  }
  return { increased, decreased };
}

function walk(dir, ext, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, ext, out);
    else if (entry.name.endsWith(ext)) out.push(path);
  }
  return out;
}

/** Hitung semua metrik di `src/`, beserta lokasi media query di luar skala untuk laporan. */
export function measure(root) {
  const src = join(root, 'src');
  const totals = { offScaleMedia: 0, important: 0, fixedHeight: 0, inlineStyle: 0 };
  const mediaHits = [];
  for (const file of walk(src, '.css')) {
    const css = readFileSync(file, 'utf8');
    const hits = offScaleMedia(css);
    totals.offScaleMedia += hits.length;
    for (const h of hits) mediaHits.push(`${relative(root, file)}:${h.line}  @media ${h.query}`);
    const c = countCss(css);
    totals.important += c.important;
    totals.fixedHeight += c.fixedHeight;
  }
  for (const file of walk(src, '.tsx')) totals.inlineStyle += countTsx(readFileSync(file, 'utf8')).inlineStyle;
  return { totals, mediaHits };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const baselinePath = join(root, 'scripts/css-guard.baseline.json');
  const { totals, mediaHits } = measure(root);

  if (process.argv.includes('--update')) {
    writeFileSync(baselinePath, JSON.stringify(totals, null, 2) + '\n');
    console.log('css-guard: angka dasar diperbarui', totals);
    return;
  }

  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const { increased, decreased } = compareToBaseline(totals, base);
  if (!increased.length && !decreased.length) return;

  for (const d of increased) console.error(`css-guard: ${d.key} naik ${d.base} → ${d.now}`);
  if (increased.some((d) => d.key === 'offScaleMedia')) {
    console.error('Media query lebar hanya boleh (width < 600px), (600px <= width < 1024px), atau (width >= 1024px):');
    for (const h of mediaHits) console.error(`  ${h}`);
  }
  for (const d of decreased) console.error(`css-guard: ${d.key} turun ${d.base} → ${d.now}`);
  if (decreased.length && !increased.length) console.error('Kunci perbaikan ini: node scripts/css-guard.mjs --update');
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

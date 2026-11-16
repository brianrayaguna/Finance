// Menyusun src/styles/uicons.css dan font ikon ber-subset dari glyph yang dipakai di src/lib/glyphs.tsx.
// Font asli Flaticon berisi ±3.500 glyph (±700 KB); hanya glyph terpakai yang disimpan di src/assets/fonts/
// sehingga HP lambat tidak perlu mendekode font raksasa saat aplikasi dibuka.
//
//   npm run uicons          tulis ulang uicons.css + font subset (butuh `hb-subset` dari HarfBuzz: brew install harfbuzz)
//   npm run uicons -- --check  pastikan uicons.css & font subset sesuai glyphs.tsx (tanpa hb-subset)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules/@flaticon/flaticon-uicons/css');
const fontDir = join(root, 'src/assets/fonts');
const source = readFileSync(join(root, 'src/lib/glyphs.tsx'), 'utf8');
const checkOnly = process.argv.includes('--check');

const regular = new Set();
const solid = new Set();
for (const m of source.matchAll(/glyph\('([\w-]+)'(?:,\s*('[\w-]+'|null))?(?:,\s*(?:'[\w-]+'|null),\s*\d+)?\)/g)) {
  regular.add(m[1]);
  if (m[2] === undefined) solid.add(m[1]);
  else if (m[2] !== 'null') solid.add(m[2].slice(1, -1));
}

function load(style) {
  const css = readFileSync(join(pkg, style, 'rounded.css'), 'utf8');
  const eot = css.match(/url\(\.\.\/(uicons-[\w-]+\.eot)[#?)]/)?.[1];
  const codes = new Map([...css.matchAll(/\.fi-(?:rr|sr)-([\w-]+):before\{content:"([^"]+)"\}/g)].map((m) => [m[1], m[2]]));
  return { eot, codes };
}

const rr = load('regular');
const sr = load('solid');

const out = [];
/** Aturan kelas + daftar codepoint (heksa) untuk subset. */
const rules = (prefix, names, codes) => {
  const cps = [];
  for (const n of [...names].sort()) {
    const code = codes.get(n);
    if (!code) throw new Error(`Ikon tidak ditemukan: fi-${prefix}-${n}`);
    out.push(`.fi-${prefix}-${n}:before{content:"${code}"}`);
    cps.push(code.replace(/^\\/, '').toLowerCase());
  }
  return [...new Set(cps)].sort();
};

const rrCps = rules('rr', regular, rr.codes);
const srCps = rules('sr', solid, sr.codes);

// Nama berkas diturunkan dari daftar codepoint (bukan isi biner) agar --check tidak memerlukan hb-subset.
const fileName = (tag, cps) => `uicons-${tag}-${createHash('sha256').update(cps.join(',')).digest('hex').slice(0, 8)}.woff`;
const rrFile = fileName('rr', rrCps);
const srFile = fileName('sr', srCps);

const header = '/* Dihasilkan oleh scripts/uicons.mjs dari src/lib/glyphs.tsx. Flaticon UIcons — https://www.flaticon.com/uicons */\n';
const css = [
  `@font-face{font-family:uicons-regular-rounded;src:url(../assets/fonts/${rrFile}) format("woff");font-display:block}`,
  `@font-face{font-family:uicons-solid-rounded;src:url(../assets/fonts/${srFile}) format("woff");font-display:block}`,
  `i[class^=fi-rr-]:before,i[class*=" fi-rr-"]:before{font-family:uicons-regular-rounded!important}`,
  `i[class^=fi-sr-]:before,i[class*=" fi-sr-"]:before{font-family:uicons-solid-rounded!important}`,
  `i[class^=fi-rr-]:before,i[class*=" fi-rr-"]:before,i[class^=fi-sr-]:before,i[class*=" fi-sr-"]:before{font-style:normal;font-weight:400!important;font-variant:normal;text-transform:none;line-height:1;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`,
  ...out,
];
const target = join(root, 'src/styles/uicons.css');
const next = header + css.join('\n') + '\n';

if (checkOnly) {
  const problems = [];
  if (!existsSync(target) || readFileSync(target, 'utf8') !== next) problems.push('src/styles/uicons.css');
  for (const f of [rrFile, srFile]) if (!existsSync(join(fontDir, f))) problems.push(`src/assets/fonts/${f}`);
  if (problems.length) {
    console.error(`Tidak sesuai dengan src/lib/glyphs.tsx: ${problems.join(', ')}. Jalankan: npm run uicons`);
    process.exit(1);
  }
  process.exit(0);
}

/** TrueType mentah diambil dari berkas EOT paket (EOT tanpa kompresi MTX = header + data TTF). */
function ttfFromEot(file) {
  const b = readFileSync(join(pkg, file));
  const eotSize = b.readUInt32LE(0);
  const dataSize = b.readUInt32LE(4);
  const flags = b.readUInt32LE(12);
  if (flags & 0x4) throw new Error(`${file}: EOT terkompresi MTX tidak didukung`);
  return b.subarray(eotSize - dataSize, eotSize);
}

/** Bungkus sfnt (TTF) menjadi WOFF 1.0 (zlib per tabel) — deterministik, tanpa dependensi. */
function toWoff(sfnt) {
  const flavor = sfnt.readUInt32BE(0);
  const numTables = sfnt.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    const tag = sfnt.readUInt32BE(p);
    const checksum = sfnt.readUInt32BE(p + 4);
    const offset = sfnt.readUInt32BE(p + 8);
    const length = sfnt.readUInt32BE(p + 12);
    const raw = sfnt.subarray(offset, offset + length);
    const z = deflateSync(raw, { level: 9 });
    tables.push({ tag, checksum, length, data: z.length < raw.length ? z : raw });
  }
  tables.sort((a, b) => a.tag - b.tag);
  const pad4 = (n) => (n + 3) & ~3;
  const headerSize = 44 + 20 * numTables;
  let size = headerSize;
  let sfntSize = 12 + 16 * numTables;
  for (const t of tables) {
    size += pad4(t.data.length);
    sfntSize += pad4(t.length);
  }
  const w = Buffer.alloc(size);
  w.writeUInt32BE(0x774f4646, 0); // 'wOFF'
  w.writeUInt32BE(flavor, 4);
  w.writeUInt32BE(size, 8);
  w.writeUInt16BE(numTables, 12);
  w.writeUInt32BE(sfntSize, 16);
  w.writeUInt16BE(1, 20);
  let off = headerSize;
  tables.forEach((t, i) => {
    const p = 44 + i * 20;
    w.writeUInt32BE(t.tag, p);
    w.writeUInt32BE(off, p + 4);
    w.writeUInt32BE(t.data.length, p + 8);
    w.writeUInt32BE(t.length, p + 12);
    w.writeUInt32BE(t.checksum, p + 16);
    t.data.copy(w, off);
    off += pad4(t.data.length);
  });
  return w;
}

function subset(eot, cps, outFile) {
  const tmp = mkdtempSync(join(tmpdir(), 'uicons-'));
  try {
    const src = join(tmp, 'in.ttf');
    const dst = join(tmp, 'out.ttf');
    writeFileSync(src, ttfFromEot(eot));
    try {
      execFileSync('hb-subset', [src, `--unicodes=${cps.join(',')}`, '--no-hinting', '-o', dst], { stdio: 'pipe' });
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error('hb-subset tidak ditemukan. Pasang HarfBuzz: brew install harfbuzz');
      throw new Error(`hb-subset gagal: ${err.stderr?.toString() || err.message}`);
    }
    const woff = toWoff(readFileSync(dst));
    writeFileSync(join(fontDir, outFile), woff);
    return woff.length;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const rrSize = subset(rr.eot, rrCps, rrFile);
const srSize = subset(sr.eot, srCps, srFile);
for (const f of readdirSync(fontDir)) {
  if (/^uicons-(rr|sr)-[0-9a-f]{8}\.woff$/.test(f) && f !== rrFile && f !== srFile) unlinkSync(join(fontDir, f));
}
writeFileSync(target, next);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`uicons.css: ${regular.size} ikon regular (${kb(rrSize)}), ${solid.size} ikon solid (${kb(srSize)})`);

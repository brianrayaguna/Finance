/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Dibaca langsung: impor `?raw` untuk berkas CSS menghasilkan string kosong di lingkungan tes.
const tokens = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');

/*
 * tokens.css menyusun warna aksen dengan oklch() dan turunannya dengan color-mix(). Mesin tanpa salah satu
 * fungsi itu memakai nilai statis di blok @supports not (...). Tes ini menghitung ulang nilai statis tersebut
 * dari rumus di tokens.css, sehingga keduanya tidak bisa berbeda tanpa ketahuan.
 */

type Rgb = [number, number, number];

function oklchToRgb(l: number, c: number, hue: number): Rgb {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  return lin.map((x) => {
    const v = Math.min(1, Math.max(0, x));
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
  }) as Rgb;
}

const hex = (rgb: Rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
const parseHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const mix = (a: Rgb, b: Rgb, p: number): Rgb => a.map((v, i) => Math.round(v * p + b[i] * (1 - p))) as Rgb;
const rgba = (rgb: Rgb, alpha: number) => `rgba(${rgb.join(', ')}, ${alpha})`;

/** Gabungan deklarasi `--nama: nilai` dari semua aturan berselektor persis `selector`, urut kaskade. */
function declsOf(css: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(new RegExp(`(?:^\\s*|[{};]\\s*|\\*/\\s*)${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

/** Rentang [awal, akhir) blok `@supports` yang dimulai di `start`, beserta isinya. */
function blockAt(start: number): { end: number; body: string } {
  const open = tokens.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i] === '{') depth++;
    else if (tokens[i] === '}' && --depth === 0) return { end: i + 1, body: tokens.slice(open + 1, i) };
  }
  throw new Error('Blok @supports tidak tertutup');
}

function supportsBlock(condition: string): string {
  const start = tokens.indexOf(`@supports not (${condition})`);
  if (start < 0) throw new Error(`Blok @supports not (${condition}) tidak ditemukan`);
  return blockAt(start).body;
}

/** tokens.css tanpa blok @supports: aturan yang dipakai mesin modern. */
const main = (() => {
  let out = '';
  let from = 0;
  for (let at = tokens.indexOf('@supports'); at >= 0; at = tokens.indexOf('@supports', from)) {
    out += tokens.slice(from, at);
    from = blockAt(at).end;
  }
  return out + tokens.slice(from);
})();
const ACCENTS = ['forest', 'ocean', 'plum', 'clay'] as const;
const accentSel = (accent: string, dark = false) =>
  `:root${dark ? "[data-theme='dark']" : ''}${accent === 'forest' ? '' : `[data-accent='${accent}']`}`;

/** Rumus oklch tiap token aksen: L tetap dan pengali chroma. */
const formulas = [
  ...main.matchAll(/(--[\w-]+):\s*oklch\(([\d.]+)\s+(?:var\(--a-c\)|calc\(var\(--a-c\)\s*\*\s*([\d.]+)\))\s+var\(--a-h\)\)/g),
].map((m) => ({ token: m[1], l: Number(m[2]), k: m[3] ? Number(m[3]) : 1 }));

const root = declsOf(main, ':root');
const dark = declsOf(main, ":root[data-theme='dark']");

function lightAccent(accent: string): Record<string, string> {
  const own = accent === 'forest' ? root : declsOf(main, `:root[data-accent='${accent}']`);
  const h = Number(own['--a-h'] ?? root['--a-h']);
  const c = Number(own['--a-c'] ?? root['--a-c']);
  return Object.fromEntries(formulas.map((f) => [f.token, hex(oklchToRgb(f.l, c * f.k, h))]));
}

/** Persentase color-mix pada token lembut (soft, softer, line). */
const softness = (decls: Record<string, string>) =>
  Object.fromEntries(['--accent-soft', '--accent-softer', '--accent-line'].map((t) => [t, Number(/(\d+)%/.exec(decls[t])![1]) / 100]));
const expectedSoft = (ink: Rgb, pct: Record<string, number>) =>
  Object.fromEntries(Object.entries(pct).map(([t, p]) => [t, rgba(ink, p)]));

describe('fallback aksen tanpa oklch()', () => {
  const block = supportsBlock('color: oklch(0 0 0)');

  it('rumus aksen ditemukan di tokens.css', () => {
    expect(formulas.map((f) => f.token).sort()).toEqual(['--accent', '--accent-ink', '--accent-strong', '--accent-wash', '--on-accent']);
  });

  for (const accent of ACCENTS) {
    it(`nilai statis ${accent} sama dengan hasil rumus`, () => {
      expect(declsOf(block, accentSel(accent))).toEqual(lightAccent(accent));
    });
  }
});

describe('fallback turunan tanpa color-mix()', () => {
  const block = supportsBlock('color: color-mix(in srgb, red, blue)');
  const graphite = declsOf(main, ":root[data-accent='graphite']");
  const graphiteDark = declsOf(main, ":root[data-theme='dark'][data-accent='graphite']");

  it('kaca terang dan gelap', () => {
    expect(declsOf(block, ":root[data-theme='light']")['--glass']).toBe(rgba([255, 255, 255], 0.9));
    expect(declsOf(block, ":root[data-theme='dark']")['--glass']).toBe(rgba(parseHex(dark['--canvas']), 0.88));
  });

  for (const accent of [...ACCENTS, 'graphite'] as const) {
    it(`token lembut ${accent} di tema terang dan gelap`, () => {
      const isGraphite = accent === 'graphite';
      const inkLight = parseHex(isGraphite ? graphite['--accent-ink'] : lightAccent(accent)['--accent-ink']);
      const accentDark = parseHex(isGraphite ? graphiteDark['--accent'] : lightAccent(accent)['--accent']);
      const lightRule = isGraphite ? ":root[data-accent='graphite']" : accentSel(accent);
      const darkRule = isGraphite ? ":root[data-theme='dark'][data-accent='graphite']" : accentSel(accent, true);

      expect(declsOf(block, lightRule)).toMatchObject(expectedSoft(inkLight, softness(root)));
      expect(declsOf(block, darkRule)).toMatchObject({
        ...expectedSoft(accentDark, softness(dark)),
        '--accent-wash': hex(mix(accentDark, parseHex(dark['--surface']), 0.12)),
      });
    });
  }
});
